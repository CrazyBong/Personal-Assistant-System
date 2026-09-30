# Personal Assistant System — POC

## 1. Goal

Build a small local assistant that reads eligible unread WhatsApp text messages, drafts a reply, and waits for the user to approve it before sending.

The system has one assistant. Personas such as **Leo** and **Maximus** are behavior settings for that assistant, not separate agents, models, or memory stores.

## 2. POC boundaries

### In scope

- WhatsApp text messages only
- Read unread one-to-one conversations
- Identify the sender and load any saved relationship notes
- Use a short recent conversation history while the process is running
- Generate a suggested reply with Ollama
- Let the user edit, approve, reject, or defer a suggestion
- Send only after an explicit user approval
- Support switching personas
- Store small user, contact, and settings files locally

### Out of scope

- Groups, images, voice messages, calls, email, calendar, browser, or computer control
- Automatic sending or autonomous actions
- Long-term conversation memory, a database, vector search, RAG, or multi-agent workflows
- Docker, cloud hosting, or multiple services

## 3. Recommended architecture

Start with one local Python process and clear responsibilities. Keep components in one application; split modules only when implementation needs make that useful.

```text
WhatsApp connector
        ↓
Message processing + duplicate prevention
        ↓
Eligibility check ── uncertain → approval inbox as review-only
        ↓
Context builder (profile + contact notes + recent messages)
        ↓
Ollama reply generator (selected persona)
        ↓
Approval inbox: edit / send / reject / defer
        ↓
WhatsApp connector sends only on explicit approval
```

The application has five responsibilities:

1. **WhatsApp connector** — read eligible messages and send approved replies.
2. **Message processing** — track message IDs and states so polling or restarting does not create duplicate drafts or sends.
3. **Context builder** — combine user profile, contact notes, persona settings, and a small recent message window.
4. **Reply generator** — call Ollama and return a draft. It must not send messages.
5. **Approval inbox** — show the incoming message and draft; support edit, send, reject, and defer.

Use a small local web UI only if a proper inbox is needed. For the earliest end-to-end prototype, a simple command-line approval flow is enough. Pick one interface and avoid maintaining both.

## 4. Message safety and eligibility

Eligibility and reply generation are separate steps. Filtering decides whether a message may be considered for a draft; it never grants permission to send.

### Direct-message-only boundary

Leo must have **no group-chat access**. This is a connector requirement, not merely an LLM prompt or a preference in settings.

- The WhatsApp connector must expose only one-to-one conversations to the assistant. It must not subscribe to, enumerate, fetch, or pass group messages, group history, group names, or group participant lists into assistant processing.
- Every message must carry a trusted chat type from the connector. Processing fails closed unless that type is exactly `individual`; missing, unknown, or group types are rejected before context files are loaded or Ollama is called.
- Do not infer one-to-one status from a display name or message content. If the chosen connector cannot reliably distinguish direct chats from groups before exposing message content, it does not meet the POC requirement and must not be connected.
- The approval inbox must not offer a way to override the group exclusion.

- Start with deterministic checks where possible: one-to-one chat, supported text message, not already processed, and not explicitly excluded.
- Known business or automated accounts can be excluded using available connector metadata and user-maintained settings.
- Do not claim perfect business, spam, or person classification. If eligibility is uncertain, mark the item **review-only** or skip it; do not silently treat uncertainty as approval.
- The assistant may read and draft, but sending always requires a deliberate user action.
- Keep a visible state for each item: `new`, `ignored`, `drafted`, `approved`, `sent`, `rejected`, or `deferred`.

## 5. Data and memory

No database is needed for the POC.

Persistent, user-controlled configuration can live in JSON:

```text
data/
  profile.json
  people.json
  settings.json
```

- `profile.json`: user preferences and general context.
- `people.json`: contact relationship, communication style, relevant context, and exclusions.
- `settings.json`: selected persona and processing preferences.

Keep recent conversation context and transient model state in RAM. Persist only what is needed to avoid duplicate processing and to retain pending approvals across a restart. Keep this state small and simple; use a JSON state file initially if needed. Revisit a database only when real usage shows JSON is inadequate.

## 6. Personas

Personas are small configuration files or settings that affect tone and style. They share the same context, connector, assistant logic, and model.

- **Leo:** calm, practical, concise, natural.
- **Maximus:** formal, respectful, slightly theatrical, still clear and useful.

Persona choice must not change message eligibility or approval requirements.

## 7. Minimal technology choices

| Concern | POC choice |
| --- | --- |
| Runtime | One local Python application |
| Model runtime | Ollama with one selected local model |
| WhatsApp | A connector behind a small interface; validate feasibility before building around it |
| Configuration | JSON files |
| Recent context | In-memory structures |
| Processing state | Minimal local JSON state if restart-safe tracking requires it |
| Approval UI | CLI for the first end-to-end slice; local web UI only when justified |
| Database / vector DB | None |
| Deployment | Run locally; no Docker initially |

The WhatsApp connector is the largest technical uncertainty. Confirm that it can reliably read the required messages and send an approved reply in the intended local setup before investing in the rest of the application.

## 8. Phase-by-phase execution plan

Work through these phases in order. Each phase should leave a runnable, reviewable result before moving on.

### Phase 0 — Validate the WhatsApp connector

**Build:** a throwaway or minimal connector spike that can inspect unread one-to-one text messages and send a test message only after a direct user action.

**Done when:**

- The chosen connector works in the intended local environment.
- The project understands its limitations, setup, and session behavior.
- A message can be identified consistently enough to prevent repeat processing.
- The user explicitly approves a test send.

**Decision:** if the connector cannot support this reliably, choose a different integration approach before building the assistant around it.

### Phase 1 — Create the smallest runnable application

**Build:** one Python entry point, configuration loading, a basic Ollama call, and a command-line conversation loop using a manually supplied message.

**Done when:**

- The app starts locally and reports configuration/model errors clearly.
- A manually supplied message produces a draft from Ollama.
- The draft is displayed and is never sent by this phase.

### Phase 2 — Add context and personas

**Build:** `profile.json`, `people.json`, `settings.json`, a small recent-message window in RAM, and Leo/Maximus style settings.

**Done when:**

- The assistant loads the files and handles missing optional files safely.
- A known contact's relationship notes and recent messages affect the draft.
- Switching persona changes style without changing the underlying assistant behavior.
- No conversation history is silently persisted as long-term memory.

### Phase 3 — Read and track WhatsApp messages

**Build:** connect the validated adapter to the application; expose only unread one-to-one text messages; apply conservative eligibility rules; track message IDs and processing state.

**Done when:**

- Only supported eligible messages become draft candidates.
- Group chats and group messages are never exposed to assistant processing, including context building and Ollama.
- Excluded or uncertain messages are skipped or marked review-only.
- Repeated polling and application restart do not create duplicate drafts for the same message.
- The user can see why a message was skipped or held for review.

### Phase 4 — Draft replies into an approval inbox

**Build:** generate a response for each eligible message and present the message, sender, relevant context, persona, and draft together. Use a CLI inbox first unless a local web UI is now clearly needed.

**Done when:**

- The user can inspect, edit, reject, or defer a draft.
- Deferred and pending drafts remain understandable after a restart.
- Model failures leave the original message available for retry and do not send anything.

### Phase 5 — Send only approved replies

**Build:** connect the explicit approval action to the adapter's send operation; update state after successful send and handle failures without duplicate sends.

**Done when:**

- No code path sends a generated draft without an explicit approval action.
- Editing the draft sends the edited text.
- Successful sends are recorded; failed sends remain visible and retryable.
- Repeating an approval action cannot accidentally send the same reply twice.

### Phase 6 — Improve the interface and reliability from use

**Build only what actual use requires:** for example, a small local web approval inbox, clearer status/logging, or better contact management.

**Done when:**

- The interface makes pending, review-only, sent, rejected, and failed items clear.
- Common connector and model failures can be diagnosed without digging through internals.
- Any added persistence or infrastructure solves an observed limitation.

Maximus can be added as a persona during Phase 2 or later. It is not a separate milestone that requires its own memory, model, or agent.

## 9. First complete user flow

```text
Unread WhatsApp text
        ↓
Check identity, eligibility, and duplicate state
        ↓
Build context and apply selected persona
        ↓
Generate a draft with Ollama
        ↓
Show draft to user
        ↓
User edits and explicitly approves
        ↓
Send through WhatsApp connector and record result
```

## 10. Design rules

1. One assistant and one local application for the POC.
2. Validate the WhatsApp integration before building dependent features.
3. Keep message IDs and processing states to prevent duplicates.
4. Treat uncertain eligibility as review-only or skip it.
5. Keep eligibility, drafting, approval, and sending as separate responsibilities.
6. Require explicit approval for every send.
7. Use JSON and RAM until real usage demonstrates a need for more infrastructure.
8. Personas affect style only.
9. Add features in the phase plan; do not build future channels into V1.
