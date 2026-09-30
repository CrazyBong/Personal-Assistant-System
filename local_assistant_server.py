"""Loopback-only API used by the WhatsApp Web overlay prototype."""

from __future__ import annotations

import hmac
import json
import secrets
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from assistant import (
    ROOT,
    DATA,
    build_prompt_for_contact,
    draft_reply,
    has_forbidden_reply_style,
    read_json,
)


HOST = "127.0.0.1"
PORT = 8765
MAX_BODY_BYTES = 32_000
PAIR_CODE = f"{secrets.randbelow(1_000_000_000_000):012d}"
PAIRED_ORIGIN: str | None = None
PAIR_TOKEN: str | None = None
PAIR_ATTEMPTS = 0
PAIR_LOCK = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    server_version = "LeoLocal/0.1"

    def log_message(self, format: str, *args: object) -> None:
        # Do not log message text, contact identifiers, drafts, or request URLs.
        print("LeoLocal: request completed")

    def _origin(self) -> str:
        return self.headers.get("Origin", "")

    def _cors(self) -> bool:
        origin = self._origin()
        allowed = origin.startswith("chrome-extension://") and (
            PAIRED_ORIGIN is None or origin == PAIRED_ORIGIN
        )
        if allowed:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header(
                "Access-Control-Allow-Headers",
                "Content-Type, X-Leo-Pair-Code, X-Leo-Token",
            )
        return allowed

    def _json(self, status: int, value: dict, cors: bool = True) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        if cors:
            self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Invalid content length") from error
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ValueError("Request body is empty or too large")
        try:
            value = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("Request body must be valid JSON") from error
        if not isinstance(value, dict):
            raise ValueError("Request body must be a JSON object")
        return value

    def _authorized(self) -> bool:
        origin = self._origin()
        token = self.headers.get("X-Leo-Token", "")
        return (
            PAIRED_ORIGIN is not None
            and origin == PAIRED_ORIGIN
            and PAIR_TOKEN is not None
            and hmac.compare_digest(token, PAIR_TOKEN)
        )

    @staticmethod
    def _unique_enabled_contacts() -> dict[str, dict]:
        people = read_json(DATA / "people.json", {})
        enabled = {
            contact_id: info
            for contact_id, info in people.items()
            if isinstance(info, dict)
            and info.get("enabled_for_assistant") is True
            and isinstance(info.get("display_name"), str)
            and info["display_name"].strip()
        }
        counts: dict[str, int] = {}
        for info in enabled.values():
            key = info["display_name"].strip().casefold()
            counts[key] = counts.get(key, 0) + 1
        return {
            contact_id: info
            for contact_id, info in enabled.items()
            if counts[info["display_name"].strip().casefold()] == 1
        }

    def do_OPTIONS(self) -> None:
        if not self._origin().startswith("chrome-extension://"):
            self.send_error(403)
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self._origin())
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Leo-Pair-Code, X-Leo-Token",
        )
        self.send_header("Access-Control-Max-Age", "300")
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            self._json(200, {"ok": True, "paired": PAIRED_ORIGIN is not None})
            return
        if path != "/contacts" or not self._authorized():
            self._json(403, {"error": "Not paired or not authorized"})
            return
        enabled = self._unique_enabled_contacts()
        contacts = [
            {
                "id": contact_id,
                "display_name": info.get("display_name", ""),
            }
            for contact_id, info in enabled.items()
        ]
        self._json(200, {"contacts": contacts})

    def do_POST(self) -> None:
        global PAIRED_ORIGIN, PAIR_TOKEN, PAIR_ATTEMPTS
        path = urlparse(self.path).path
        try:
            payload = self._read_body()
        except ValueError as error:
            self._json(400, {"error": str(error)})
            return

        if path == "/pair":
            origin = self._origin()
            code = self.headers.get("X-Leo-Pair-Code", "")
            if not origin.startswith("chrome-extension://"):
                self._json(403, {"error": "Pairing is only available to browser extensions"})
                return
            with PAIR_LOCK:
                if PAIRED_ORIGIN is not None:
                    self._json(409, {"error": "This server is already paired; restart it to pair again"})
                    return
                PAIR_ATTEMPTS += 1
                if PAIR_ATTEMPTS > 10:
                    self._json(429, {"error": "Too many pairing attempts; restart the local service"})
                    return
                if not hmac.compare_digest(code, PAIR_CODE):
                    self._json(403, {"error": "Pairing code is incorrect"})
                    return
                PAIRED_ORIGIN = origin
                PAIR_TOKEN = secrets.token_urlsafe(32)
            self._json(200, {"token": PAIR_TOKEN})
            print("Leo overlay paired to one browser extension.")
            return

        if path == "/unpair":
            if not self._authorized():
                self._json(403, {"error": "Not paired or not authorized"})
                return
            PAIRED_ORIGIN = None
            PAIR_TOKEN = None
            self._json(200, {"ok": True})
            print("Leo overlay unpaired.")
            return

        if path != "/draft" or not self._authorized():
            self._json(403, {"error": "Not paired or not authorized"})
            return

        # Fail closed before loading contact context or calling Ollama.
        if payload.get("chat_type") != "individual":
            self._json(403, {"error": "Only confirmed one-to-one chats are allowed"})
            return
        contact_id = payload.get("contact_id")
        text = payload.get("incoming_text")
        if not isinstance(contact_id, str) or not isinstance(text, str) or not text.strip():
            self._json(400, {"error": "A contact and message are required"})
            return
        if len(text) > 20_000:
            self._json(413, {"error": "Message context is too long"})
            return

        enabled = self._unique_enabled_contacts()
        contact = enabled.get(contact_id)
        if not isinstance(contact, dict):
            self._json(403, {"error": "This contact is not enabled for Leo"})
            return

        try:
            settings = read_json(DATA / "settings.json", {})
            persona_name = settings.get("persona", "leo")
            persona = read_json(ROOT / "personas" / f"{persona_name}.json", {})
            sender = contact.get("display_name") or contact_id
            prompt = build_prompt_for_contact(sender, text, contact, persona)
            model = settings.get("model", "qwen3:4b")
            reply = draft_reply(model, prompt)
            if has_forbidden_reply_style(reply):
                retry_prompt = prompt + [
                    {"role": "assistant", "content": reply},
                    {
                        "role": "user",
                        "content": "Rewrite without any emoji or em dash. Return only the reply.",
                    },
                ]
                reply = draft_reply(model, retry_prompt)
                if has_forbidden_reply_style(reply):
                    raise ValueError("Reply did not meet the configured style")
        except Exception as error:
            # Avoid returning local paths or implementation details to the page.
            print(f"Draft generation failed: {type(error).__name__}", file=sys.stderr)
            self._json(502, {"error": "Could not create a draft. Check the local model and settings."})
            return
        self._json(200, {"draft": reply})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Leo local service listening at http://{HOST}:{PORT}")
    print(f"One-time browser extension pairing code: {PAIR_CODE}")
    print("Only the paired extension can request drafts. Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nLeo local service stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
