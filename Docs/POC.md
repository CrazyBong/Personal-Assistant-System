# Personal AI Assistant System — POC

## 1. Overview

A lightweight, private personal AI assistant system designed initially to interact with **WhatsApp**.

The system has one central AI assistant and supports multiple **personas** that determine how the assistant communicates.

Example personas:

* **Leo** — general-purpose, Jarvis-style personal assistant
* **Maximus** — medieval-style personal butler

The personas are **not separate agents or systems**. They are behavioral configurations used by the same underlying assistant.

---

# 2. POC Scope

The first version is **WhatsApp text only**.

### The system can

* Detect unread WhatsApp messages
* Read unread **person-to-person** messages
* Identify the sender
* Understand the current conversation
* Use basic information about the user
* Use information about the relationship with the sender
* Generate an appropriate response
* Present the response for user approval
* Send the approved response
* Maintain temporary conversation context while running
* Switch between personas

### The system should ignore

* WhatsApp Business accounts
* Company accounts
* Brand accounts
* Sponsored messages
* Advertisements
* Marketing messages
* Promotional messages
* Obvious spam
* Automated/bot accounts
* Company/customer-service conversations
* Broadcast/promotional content

### Not in POC

* Image processing
* Voice messages
* Calls
* Email
* Calendar
* Browser control
* Computer control
* Autonomous internet research
* Automatic message sending without approval

---

# 3. Core Architecture

```text
                         WhatsApp
                            │
                            ↓
                  ┌──────────────────┐
                  │ WhatsApp Adapter │
                  └────────┬─────────┘
                           ↓
                  ┌──────────────────┐
                  │ Unread Message   │
                  │    Filter        │
                  └────────┬─────────┘
                           │
                    Person-to-Person?
                     /             \
                   NO               YES
                   │                 │
                 IGNORE              ↓
                              ┌──────────────┐
                              │ AI Assistant │
                              │     Core     │
                              └──────┬───────┘
                                     │
                        ┌────────────┼────────────┐
                        ↓            ↓            ↓
                  User Context  Relationship  Conversation
                                  Context       Memory
                        │            │            │
                        └────────────┼────────────┘
                                     ↓
                              ┌─────────────┐
                              │   Persona   │
                              │             │
                              │ Leo /       │
                              │ Maximus     │
                              └──────┬──────┘
                                     ↓
                              ┌─────────────┐
                              │     LLM     │
                              │   Ollama    │
                              └──────┬──────┘
                                     ↓
                              Suggested Reply
                                     ↓
                              ┌─────────────┐
                              │    User     │
                              │   Approval  │
                              └──────┬──────┘
                                     ↓
                                  WhatsApp
```

---

# 4. Unread Message Processing

Leo should **not continuously process every message**.

The initial workflow is:

```text
System starts
     ↓
Check WhatsApp
     ↓
Find unread messages
     ↓
Filter messages
     ↓
Process eligible conversations
```

Only messages that are currently unread should enter the AI pipeline.

### Example

```text
Rahul          → 2 unread       → PROCESS
Rohan          → 1 unread       → PROCESS
Company X      → 3 unread       → IGNORE
Marketing      → 1 unread       → IGNORE
Unknown spam   → 2 unread       → IGNORE
```

The goal is to prevent Leo from unnecessarily processing the user's entire WhatsApp history.

---

# 5. Message Eligibility Filter

Before sending anything to the LLM, every unread conversation passes through a filter.

```text
Unread message
      ↓
Is it person-to-person?
      │
   ┌──┴──┐
   NO    YES
   │      │
 IGNORE   ↓
      Is it business/advertising/spam?
            │
         ┌──┴──┐
        YES    NO
         │      │
       IGNORE   ↓
            PROCESS
```

### Ignore

* Business accounts
* Companies
* Brands
* Customer-support accounts
* Sponsored messages
* Advertisements
* Promotional messages
* Marketing campaigns
* Automated notifications
* Obvious spam
* Bots

### Process

Normal **person-to-person conversations** such as:

* Friends
* Family
* Classmates
* Colleagues
* Recruiters communicating personally
* Acquaintances
* Other individual contacts

The system should prefer **conservative filtering**.

If Leo cannot confidently determine whether a conversation is a legitimate person-to-person conversation, it should **not automatically respond**.

---

# 6. Important Distinction

The system should separate:

```text
MESSAGE ELIGIBILITY
        ↓
Should Leo process this?
```

from:

```text
RESPONSE GENERATION
        ↓
What should Leo say?
```

The LLM should ideally receive only messages that have already passed the basic eligibility filter.

This reduces unnecessary processing and makes Leo's behavior more predictable.

---

# 7. Personal Context

Leo should have structured information about the user.

Example:

```json
{
  "name": "Shubhranshu",
  "preferences": [],
  "communication_style": [],
  "general_context": []
}
```

This information is loaded when the system starts.

It is **persistent configuration**, not AI memory.

---

# 8. Relationships

Leo should understand that different people have different relationships with the user.

Example:

```text
Shubhranshu
│
├── Family
├── Friends
├── College
├── Professional
└── Other
```

Each person can have:

```text
Name
Relationship
Trust level
Communication style
General context
Relevant boundaries
```

Example:

```json
{
  "Rahul": {
    "relationship": "college friend",
    "trust_level": "high",
    "communication_style": "casual",
    "context": []
  }
}
```

This allows the same assistant to communicate differently with different people.

---

# 9. Memory Model

The POC deliberately uses **no database**.

## Temporary Memory

Stored only in RAM while the system is running.

```python
conversation_memory = {}
current_context = {}
session_memory = {}
```

Temporary memory includes:

* Recent messages
* Current conversation
* Current topic
* Information learned during the session
* Current reasoning context

When the system shuts down:

```text
System stops
     ↓
Process terminates
     ↓
RAM memory disappears
```

The next startup begins with fresh temporary memory.

---

# 10. Persistent Information

Only intentionally saved information survives a restart.

Use simple JSON files:

```text
data/
├── profile.json
├── people.json
└── settings.json
```

There is **no database** in the POC.

### `profile.json`

General information about the user.

### `people.json`

Basic relationship information about people the user chooses to define.

### `settings.json`

System preferences such as:

```text
Selected persona
Approval mode
Processing preferences
```

---

# 11. Personas

Personas define **how the assistant behaves and communicates**.

They do not have separate memories or separate AI models.

## Leo

```text
Name: Leo

Role:
General-purpose personal assistant

Style:
Calm
Practical
Professional
Natural

Behavior:
- Helpful
- Context-aware
- Concise
- Adapts communication to the recipient
```

## Maximus

```text
Name: Maximus

Role:
Medieval personal butler

Style:
Formal
Loyal
Respectful
Composed
Slightly theatrical

Behavior:
- Addresses the user respectfully
- Uses medieval-inspired language
- Remains understandable
- Prioritizes practical assistance
```

Both use the same:

```text
AI Core
User Context
Relationship Context
Temporary Memory
WhatsApp Adapter
LLM
```

Only the persona changes.

---

# 12. Message Processing Pipeline

For an eligible unread message:

```text
Unread Message
      ↓
Identify Sender
      ↓
Verify Person-to-Person
      ↓
Load Relationship
      ↓
Load User Context
      ↓
Load Recent Conversation
      ↓
Retrieve Temporary Memory
      ↓
Apply Selected Persona
      ↓
Send Context to LLM
      ↓
Generate Suggested Response
      ↓
Show to User
```

Example:

```text
Rahul:
"Bro are you coming tomorrow?"
```

Leo sees:

```text
Sender:
Rahul

Relationship:
College friend

Communication:
Casual

Recent context:
Discussing tomorrow's event

Message:
"Bro are you coming tomorrow?"
```

Possible response:

```text
"Yeah bro, I'll be there tomorrow."
```

---

# 13. Approval System

The POC should use **approval-first behavior**.

Leo generates the response but does not automatically send it.

```text
┌──────────────────────────────────┐
│ Suggested response               │
│                                  │
│ Yeah bro, I'll be there tomorrow.│
│                                  │
│ [ SEND ] [ EDIT ] [ REJECT ]     │
└──────────────────────────────────┘
```

### Automatically allowed

* Read eligible unread messages
* Analyze conversations
* Use context
* Generate responses
* Maintain temporary memory

### Requires approval

* Sending a WhatsApp message

No autonomous sending in V1.

---

# 14. Technology Stack

Keep the stack minimal.

| Component            | Technology              |
| -------------------- | ----------------------- |
| Programming language | **Python**              |
| AI runtime           | **Ollama**              |
| LLM                  | Local model             |
| WhatsApp integration | **WhatsApp Adapter**    |
| Temporary memory     | **Python RAM objects**  |
| Persistent data      | **JSON files**          |
| UI                   | **Simple React + Vite** |
| Database             | **None**                |
| Vector database      | **None**                |
| RAG                  | **None**                |
| Docker               | **None initially**      |

The system should run locally on one machine.

---

# 15. Project Structure

```text
assistant-system/
│
├── main.py
│
├── core/
│   ├── agent.py
│   ├── context.py
│   ├── memory.py
│   ├── message_filter.py
│   └── permissions.py
│
├── personas/
│   ├── leo.json
│   └── maximus.json
│
├── whatsapp/
│   └── adapter.py
│
├── llm/
│   └── ollama.py
│
├── data/
│   ├── profile.json
│   ├── people.json
│   └── settings.json
│
└── ui/
    └── ...
```

---

# 16. Runtime Flow

```text
                    SYSTEM START
                         │
                         ↓
                  Load JSON data
                         │
                         ↓
                Initialize RAM memory
                         │
                         ↓
                Connect to WhatsApp
                         │
                         ↓
                 Check unread messages
                         │
                         ↓
                  Message filter
                         │
             ┌───────────┴───────────┐
             ↓                       ↓
        Not eligible              Eligible
             │                       │
           Ignore                    ↓
                              Identify sender
                                     ↓
                              Load relationship
                                     ↓
                              Build context
                                     ↓
                              Select persona
                                     ↓
                                Call LLM
                                     ↓
                              Generate reply
                                     ↓
                              User approval
                                     ↓
                                Send reply
                                     ↓
                              Update RAM
```

---

# 17. Development Phases

## Phase 1 — Basic Assistant

* [ ] Python application
* [ ] Ollama integration
* [ ] Basic conversation
* [ ] Leo persona
* [ ] Temporary RAM memory

## Phase 2 — Personal Context

* [ ] `profile.json`
* [ ] `people.json`
* [ ] Relationship context
* [ ] Persona configuration

## Phase 3 — WhatsApp Reading

* [ ] WhatsApp adapter
* [ ] Detect unread messages
* [ ] Read eligible text messages
* [ ] Identify sender
* [ ] Apply message filter

## Phase 4 — Response Generation

* [ ] Retrieve conversation context
* [ ] Apply relationship context
* [ ] Apply selected persona
* [ ] Generate suggested response

## Phase 5 — Approval

* [ ] Suggested response UI
* [ ] Edit response
* [ ] Send approved response
* [ ] Reject response

## Phase 6 — Maximus

* [ ] Add Maximus persona
* [ ] Persona switching
* [ ] Shared user context
* [ ] Shared temporary memory

---

# 18. Definition of Done

The POC is complete when:

```text
Person sends WhatsApp message
             ↓
Message is unread
             ↓
System detects it
             ↓
System checks message type
             ↓
Business / spam / advertisement?
        │              │
       YES             NO
        │              │
      IGNORE           ↓
                 Person-to-person
                       ↓
                Identify person
                       ↓
                Load relationship
                       ↓
                Load conversation
                       ↓
                 Apply persona
                       ↓
                  Ask LLM
                       ↓
               Generate response
                       ↓
                 User reviews
                       ↓
                User clicks SEND
                       ↓
                WhatsApp sends it
```

---

# 19. Future Expansion

Once WhatsApp text works reliably, capabilities can be added one at a time:

```text
Current
   │
   └── WhatsApp Text
          │
          ├── Images
          ├── Voice
          └── Documents
```

Later:

```text
Assistant Core
      │
      ├── WhatsApp
      ├── Calendar
      ├── Email
      ├── Files
      └── Browser
```

These are **future tools**, not part of the initial POC.

---

# Core Design Principles

1. **WhatsApp only for V1.**
2. **Only process unread messages.**
3. **Only process person-to-person conversations.**
4. **Ignore businesses, companies, advertisements, promotions, and obvious spam.**
5. **When classification is uncertain, do not automatically respond.**
6. **Temporary memory lives only in RAM.**
7. **Only basic user/relationship information is persisted in JSON.**
8. **Leo and Maximus are personas, not separate agents.**
9. **The user approves messages before they are sent.**
10. **No unnecessary infrastructure.**

### V1 Stack

**Python + Ollama + WhatsApp Adapter + JSON + RAM + simple React UI.**

The target is a small local system with one clean loop:

**Unread WhatsApp → Filter → Context → Persona → LLM → User Approval → WhatsApp**
