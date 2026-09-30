# Personal Assistant System — POC

## 1. Goal

Build a small local assistant that reads eligible unread WhatsApp text messages, drafts a reply, and waits for the user to approve it before sending.

The system has one assistant. Personas such as **Leo** and **Maximus** are behavior settings for that assistant, not separate agents, models, or memory stores.

The eventual goal is for Leo to notice unread one-to-one messages and, when the user is away, reply autonomously within rules the user controls. The first POC remains approval-first. Automatic replies come only after the connector and approval workflow prove reliable.

## 2. POC boundaries

### In scope

- WhatsApp text messages only
- First overlay slice: operate only in the currently open chat after the user selects an allowlisted contact and confirms it is one-to-one
- Future connector phase: watch unread one-to-one conversations from allowlisted contacts
- Process only individually allowlisted contacts; all other senders are ignored
- Identify the sender and load any saved relationship notes
- Use a short recent conversation history while the process is running
- Generate a suggested reply with Ollama
- Show a generated suggestion and let the user review it
- Optionally place the draft in the current WhatsApp composer; the user sends it
- Support switching personas
- Store small user, contact, and settings files locally

### Out of scope

- Groups, images, voice messages, calls, email, calendar, browser, or computer control
- Automatic sending in the first POC. This is a later, opt-in capability, not a permanent product restriction.
- Long-term conversation memory, a database, vector search, RAG, or multi-agent workflows
- Docker, cloud hosting, or multiple services

## 3. Recommended architecture

Start with one local Python process and a small browser extension. The extension is a visible UI bridge to the currently open WhatsApp Web chat. It must not scrape or watch the whole inbox in this first slice.

```text
WhatsApp Web tab
        ↓
Visible overlay: choose allowlisted contact + select/paste message
        ↓
Local bridge ── fail closed unless paired, allowlisted, and user confirms one-to-one
        ↓
Python loopback service
        ↓
Ollama reply generator (selected persona, local model)
        ↓
Review draft → place in current composer → user presses Send
```

The first overlay can only use text the user selects or pastes from the current chat. It reads the active chat title to check that it matches the selected contact, requires the user to confirm the chat is one-to-one, and never presses Send. If the title or message composer cannot be identified, it must stop. The confirmation is a user check, not a trusted WhatsApp chat-type signal. Until the page structure is verified against a live WhatsApp Web session, this prototype cannot guarantee that a mistaken confirmation or duplicate display name will never expose group text to Ollama.

The application has five responsibilities:

1. **UI bridge** — act only on the open WhatsApp Web tab and current conversation; place draft text in the composer but never click Send.
2. **Local bridge** — accept requests only from the paired extension, on loopback, and call the local model.
3. **Context builder** — combine user profile, contact notes, persona settings, and a small recent message window.
4. **Reply generator** — call Ollama and return a draft. It must not send messages.
5. **Contact gate** — allow only explicitly enabled contacts and reject unknown chat types before model access.

The later unread watcher and autonomous sending phases require a connector that can identify chats reliably. Do not extend the UI prototype to scan chats until recipient and group detection are proven.

## 4. Message safety and eligibility

Eligibility and reply generation are separate steps. Filtering decides whether a message may be considered for a draft; it never grants permission to send.

### Direct-message-only boundary

Leo must have **no group-chat access**. This is a connector requirement, not merely an LLM prompt or a preference in settings.

- The WhatsApp connector must expose only one-to-one conversations to the assistant. It must not subscribe to, enumerate, fetch, or pass group messages, group history, group names, or group participant lists into assistant processing.
- Apply a sender allowlist before reading message content or building context. Store stable contact identifiers, such as WhatsApp IDs or normalized phone numbers, rather than relying on display names. Unknown and non-allowlisted senders are dropped by default.
- Every message must carry a trusted chat type from the connector. Processing fails closed unless that type is exactly `individual`; missing, unknown, or group types are rejected before context files are loaded or Ollama is called.
- Do not infer one-to-one status from a display name or message content. If the chosen connector cannot reliably distinguish direct chats from groups before exposing message content, it does not meet the POC requirement and must not be connected.
- The approval inbox must not offer a way to override the group exclusion.
- The connector or earliest local filter must drop non-allowlisted messages before content is passed to Ollama, persisted, or written to application logs.

### Reply style

Generated replies must contain no emojis and no em dash (`—`). The incoming message may contain emoji; do not reject a person-to-person message solely for that reason. The application checks the generated reply and retries once if the style rule is violated. If the retry still violates it, no draft is shown.

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
- `people.json`: contact identifier, whether that contact is explicitly enabled for Leo, relationship, communication style, relevant context, and exclusions.
- `settings.json`: selected persona and processing preferences.

Contact access is opt-in per person. A contact missing from `people.json`, or whose `enabled_for_assistant` setting is false, is ignored. Do not use a display name as the allowlist key because names can be duplicated or changed.

Keep recent conversation context and transient model state in RAM. Persist only what is needed to avoid duplicate processing and to retain pending approvals across a restart. Keep this state small and simple; use a JSON state file initially if needed. Revisit a database only when real usage shows JSON is inadequate.

## 6. Personas

Personas are small configuration files or settings that affect tone and style. They share the same context, connector, assistant logic, and model.

- **Leo:** calm, practical, concise, natural.
- **Maximus:** formal, respectful, slightly theatrical, still clear and useful.

Persona choice must not change message eligibility or approval requirements.

## 7. Minimal technology choices

| Concern | POC choice |
| --- | --- |
| Runtime | One local Python service plus a small browser extension |
| Model runtime | Ollama with one selected local model |
| WhatsApp | Browser overlay for the open chat; validate before adding any unread watcher |
| Configuration | JSON files |
| Recent context | In-memory structures |
| Processing state | Minimal local JSON state if restart-safe tracking requires it |
| Approval UI | Small WhatsApp Web overlay; user presses Send |
| Database / vector DB | None |
| Deployment | Run locally; no Docker initially |

The WhatsApp UI bridge is the largest technical uncertainty. Confirm recipient identity and direct-chat detection in the intended browser before adding unread monitoring or any automated sending.

## 8. Phase-by-phase execution plan

Work through these phases in order. Each phase should leave a runnable, reviewable result before moving on.

**Current status:** the local Ollama draft flow, JSON configuration, and personas exist. The overlay and local bridge are implemented as a draft-only prototype. Phase 0 is still open because WhatsApp Web is not connected and its selectors and direct-chat checks have not been verified in a live session.

### Phase 0 status — personal inbox access remains unresolved

Initial research shows a mismatch to resolve before connecting a personal WhatsApp account:

- Meta's official WhatsApp Business Platform is built for business messaging, not for reading a person's existing personal WhatsApp inbox. This is an inference from the official platform documentation and supported use cases: [Meta WhatsApp Business Platform collection](https://www.postman.com/meta/whatsapp-business-platform/overview).
- WhatsApp's official third-party agent feature does not provide inbox monitoring. Its help page says an agent can read only what the user shares in the agent chat: [WhatsApp Help Center: third-party agents](https://faq.whatsapp.com/1050934623978152). The agent terms also say messages shared with a third-party agent are not end-to-end encrypted and are processed by that provider: [Third-Party Agent Terms](https://www.whatsapp.com/legal/third-party-agents-terms).
- Common WhatsApp Web automation libraries expose general message events and group-chat types, so filtering after message delivery would not satisfy the strict requirement that group content is never exposed to Leo. For example, [whatsapp-web.js API types](https://github.com/wwebjs/whatsapp-web.js/blob/main/index.d.ts) define both message events and group chat types.
- WhatsApp's terms restrict unauthorized automated access and collection: [WhatsApp Terms of Service](https://www.whatsapp.com/legal/terms-of-service?lang=en).

Therefore Phase 0 is **not complete**. The official options found so far do not provide a supported way for a local assistant to watch unread messages in the user's existing personal inbox. The current UI approach avoids internal chat APIs, but it is still UI automation and its recipient/group checks are not verified against a live WhatsApp Web page. WhatsApp's terms restrict some automated access and auto-messaging. Treat the overlay as a draft-only feasibility prototype, not as a supported or reliable unattended connector. Do not use it for sensitive group conversations until the group detection boundary has been verified.

### Phase 0 — Validate the UI bridge

**Build:** a visible overlay for the active WhatsApp Web chat. The user selects an enabled contact, confirms it is a one-to-one chat, supplies recent message text, reviews a generated draft, and inserts it into the composer. The user presses Send themselves.

**Done when:**

- The local service pairs with only the intended extension and binds only to `127.0.0.1`.
- Only enabled contacts from `people.json` can request drafts.
- The open chat title must match the selected contact before reading selected text or inserting a draft.
- Unknown and ambiguous contacts are blocked. Group exclusion is not considered technically proven until a reliable direct-chat signal is verified in WhatsApp Web; the user confirmation checkbox alone is not proof.
- The extension never clicks Send or overwrites existing composer text.

**Decision:** if the UI cannot prove the active chat matches a unique allowlisted contact, keep the user in copy/paste mode and do not add unattended monitoring or sending.

### Phase 1 — Create the smallest runnable application

**Build:** one Python entry point, configuration loading, a basic Ollama call, and a one-message draft flow using a manually supplied message.

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

### Phase 3 — Watch unread messages from allowlisted contacts

**Build:** only after Phase 0 is proven, add a watcher for unread one-to-one chats from allowlisted contacts. It must not enumerate or read group message content.

**Done when:**

- Only supported eligible messages become draft candidates.
- Only contacts explicitly enabled by the user are processed; all other contacts default to ignored.
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

### Phase 7 — Controlled unattended replies

This phase implements the eventual goal after Phases 0 through 6 are reliable. It is opt-in and disabled by default.

**Build:** per-contact automatic-reply settings, a global pause switch, a bounded set of situations that may be answered automatically, and an audit trail of every draft and send.

**Rules:**

- Automatic replies are allowed only for explicitly allowlisted one-to-one contacts.
- Unknown contacts, uncertain eligibility, model or connector errors, and messages outside the user's configured scope stay in approval mode.
- Do not auto-send replies involving sensitive decisions, financial commitments, legal or medical advice, or promises on the user's behalf.
- Always prevent duplicate sends and make it easy to pause automation immediately.

**Done when:**

- The user can enable or disable autonomy globally and per contact.
- A monitored trial demonstrates correct recipient selection, group exclusion, duplicate prevention, and pause behavior before unattended use.
- Every automatic reply is recorded with the incoming message, generated text, recipient, and send result.
- The user can review what Leo sent and change the rules without editing code.

Maximus can be added as a persona during Phase 2 or later. It is not a separate milestone that requires its own memory, model, or agent.

Autonomy is a later mode of the same assistant. It does not bypass the connector's direct-message-only requirement or the user's per-contact rules.

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
