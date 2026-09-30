# Personal-Assistant-System
A lightweight, local personal assistant. See [Docs/POC.md](Docs/POC.md) for the architecture, strict one-to-one-only WhatsApp boundary, and phase plan.

## Current prototype

The first slice drafts a reply from a manually supplied message. It does not connect to WhatsApp or send messages.

Requirements: Python 3.10+ and Ollama running locally with `qwen3:4b` installed.

```powershell
python assistant.py --chat-type individual --sender "Rahul" --message "Are you coming tomorrow?"
```

Only `--chat-type individual` is accepted. Group, missing, and unknown chat types are rejected before profile/contact context is loaded or Ollama is called. A future WhatsApp connector must guarantee that group chats are not exposed to the assistant at all; see the direct-message-only boundary in the POC.
