# Personal Assistant System

A local, approval-first assistant prototype. The eventual goal is unattended replies to a small allowlist of one-to-one WhatsApp contacts. The current browser overlay is draft-only and requires you to open the chat, provide the text, verify the recipient, and press Send yourself.

See [Docs/POC.md](Docs/POC.md) for the architecture, group exclusion, connector limitations, and execution phases.

## Current overlay slice

Requirements: Python 3.10+ and Ollama running locally with `qwen3:4b` installed.

1. Add selected contacts to `data/people.json`. Use a stable contact ID or normalized phone number as the key. Example:

   ```json
   {
     "+919876543210": {
       "display_name": "Rahul",
       "enabled_for_assistant": true,
       "relationship": "college friend",
       "trust_level": "high",
       "communication_style": "casual",
       "context": []
     }
   }
   ```

2. Start the local bridge from the project directory:

   ```powershell
   python local_assistant_server.py
   ```

   It binds to `127.0.0.1:8765` and prints a one-time pairing code. Keep the terminal open while using the overlay.

3. Load the unpacked browser extension from the `overlay` directory using the browser's extension developer tools. Open its popup and enter the pairing code.

4. Open WhatsApp Web. In the currently open one-to-one chat, open Leo, select the matching allowlisted contact, paste or select message text, confirm the recipient, and generate a draft.

5. Review the draft and choose **Place draft in WhatsApp composer**. Leo does not click Send. Check the visible recipient and message, then send it yourself.

The extension runs only on `https://web.whatsapp.com/` and communicates with the paired loopback service. The service rejects unpaired requests, unenabled contacts, and anything not marked as an individual chat. It does not have a WhatsApp send endpoint.

## Current limitations

- This first UI slice does not scan unread chats or run while WhatsApp is closed.
- The active chat title and composer are detected from WhatsApp Web's page structure, which can change. If Leo cannot verify the selected contact or locate one composer, it stops.
- The one-to-one checkbox is a user confirmation, not a technical proof of chat type. The page selectors have not been verified against a live WhatsApp Web session, so group exclusion is not yet a hard guarantee. Do not use group text with the overlay or enable unattended reading or sending until a reliable chat-type check is proven.
- UI automation is not an official WhatsApp API and may be subject to WhatsApp's terms. See the connector analysis in the POC.
