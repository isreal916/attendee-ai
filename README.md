# Attendee AI

An HR assistant that remembers the employee.

Most HR chatbots are stateless FAQ bots: every conversation starts from zero, and the employee explains their role, their goals and how they like answers all over again. Attendee AI ("Attie") keeps a small, personal memory for each employee on [Walrus Memory](https://docs.wal.app/walrus-memory), and combines it with live records from the HR system.

Built for AttendeeHRM, an HR management system, and for Walrus Sessions 8, "Chatbots That Remember".

- **Model and runtime:** DeepSeek (`deepseek-v4-pro` for replies, `deepseek-flash` for the memory step) through its OpenAI-compatible API, on Node.js. Any OpenAI-compatible provider works; Groq is preconfigured as an alternative.
- **Memory:** Walrus Memory through the `@mysten-incubation/memwal` TypeScript SDK.

## The one rule that shapes everything

Two kinds of information, kept strictly apart:

| Information | Where it lives | Why |
|---|---|---|
| Leave balance, attendance, shifts, pay, job title, department | The HR system, fetched live on every question | It changes, and the HR system is the source of truth |
| Goals, answer preferences, what you are learning, plans, open threads | Walrus Memory | Personal context the employee chose to share |

Memory never holds an HR record, and a remembered fact never overrides one. If an employee says "I'm the HR manager" and the HR record says otherwise, the assistant goes with the record, and the claim is not stored.

## How a chat turn works

```
employee message
   │
   ├─ recall from Walrus Memory  (this employee's namespace only)
   │     • memories relevant to the message
   │     • preferences, goals and current focus, always
   │
   ├─ reply ──────────────────────────────┐   ├─ memory step (runs alongside the reply)
   │   model + HR tools, called with the  │   │   reads only the employee's message,
   │   employee's own access token        │   │   proposes 0–3 facts worth keeping
   │                                      │   │
   ▼                                      ▼   ▼
reply + "used N memories" + "live HR data: …"   policy screen → save to Walrus in the background
```

- **One namespace per employee** (`attendee:{companyId}:{userId}`), derived from the verified sign-in. Nothing the browser or the model sends can change it.
- **Saves never block the chat.** A Walrus save took 26–39 seconds in our tests, so the memory is acknowledged at once ("Will remember: …", with Undo) and uploaded in the background. It is usable in the next message while it uploads.
- **Forgetting.** Walrus Memory has no call to forget a single memory, so a forgotten or corrected memory is tombstoned in a small local index and filtered out of every recall. See [Limitations](#limitations).
- **Memory can be switched off per chat**, which gives an honest before/after comparison on the same question.

## What is never remembered

Every save passes a deterministic screen ([src/memory/policy.js](src/memory/policy.js)), whatever the model proposed:

- HR records and numbers: leave balances, attendance, pay, shift times
- Current job title, role or authority (that comes from the HR record)
- Health, religion, ethnicity, sexuality, politics, union membership
- Complaints or opinions about a manager or colleague; anything about another person
- Credentials, bank or ID details

Memories have a type, and most expire:

| Type | Example | Kept for |
|---|---|---|
| `preference` | Prefers short answers | Until changed |
| `goal` | Wants to become a tech lead | Until changed |
| `focus` | Learning Next.js | 180 days |
| `context` | New to the city | 90 days |
| `plan` | Wants the week of 21 December off | 120 days |
| `open_thread` | Drafted a leave request, not yet submitted | 30 days |
| `achievement` | Shipped the new payroll export | 400 days |
| `knows` | Already knows how to submit a leave request | 180 days |

Three behaviours build on these:

- **Wins for appraisal time.** Achievements the employee mentions are kept, and recalled whenever they ask about their achievements or an upcoming review.
- **No repeated explanations.** Once the employee confirms a how-to worked, the assistant gives a one-line answer next time instead of the full walkthrough.
- **Follow-ups.** Drafting a leave request saves an open thread automatically, and the next conversation asks whether it was submitted.

The first time an employee chats, the assistant asks once how they like answers, what they are working on and one goal for the quarter.

## Quick start (demo mode, no accounts needed except a model key)

Requires Node.js 24 or newer (the service uses the built-in `node:sqlite`; developed on 24.13).

```bash
git clone <this repo>
cd attendee-ai
npm install
cp .env.example .env
```

In `.env`, set a model key and choose demo mode:

```
DEEPSEEK_API_KEY=your-key
HR_ADAPTER=mock
MEMORY_BACKEND=mock
```

Start the service, then chat from a second terminal:

```bash
npm start
```

```bash
npm run chat -- demo-ada
```

`demo-ada`, `demo-tunde` and `demo-ngozi` are three seeded employees of a demo company. Try:

1. `I'm learning Next.js and want to become a tech lead. Keep answers short.`
2. `/new` to start a fresh conversation
3. `What should I focus on this week?` and see it use what it remembers
4. `/memory off`, ask again, and compare
5. `/memories` to list what it holds, `/forget 1` to remove one

With `MEMORY_BACKEND=mock` memories live in the process and are lost on restart. Use Walrus for real persistence.

## Run with Walrus Memory

1. Create an account and a delegate key at [staging.memory.walrus.xyz](https://staging.memory.walrus.xyz) (testnet) or [memory.walrus.xyz](https://memory.walrus.xyz) (mainnet).
2. In `.env`, set `MEMWAL_ACCOUNT_ID`, `MEMWAL_PRIVATE_KEY` and the matching `MEMWAL_SERVER_URL`, and remove `MEMORY_BACKEND=mock`.
3. Check the connection. This stores and recalls a few test memories in throwaway namespaces:

```bash
npm run spike:memory
```

## Run against AttendeeHRM

```
HR_ADAPTER=attendeehrm
ATTENDEE_API_URL=https://your-attendeehrm-host/api
CORS_ORIGINS=https://your-frontend-origin
```

The frontend sends the signed-in employee's AttendeeHRM access token as a `Bearer` token. The service ([src/hr/attendeehrm.js](src/hr/attendeehrm.js)):

- confirms the token with the HR backend before anything else;
- sends only the token owner's own `userid` and `pin` in every request;
- checks that each response belongs to that employee and discards it otherwise;
- calls only self-service endpoints, and passes attendance summaries to the model without the daily records.

To support a different HR system, implement the same five methods as [src/hr/mock.js](src/hr/mock.js) and register it in [src/hr/index.js](src/hr/index.js).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DEEPSEEK_API_KEY` | | Model key. Or `GROQ_API_KEY` for Groq |
| `LLM_MODEL`, `LLM_EXTRACT_MODEL` | `deepseek-v4-pro`, `deepseek-flash` | Reply model, memory-step model |
| `LLM_BASE_URL` | DeepSeek | Any OpenAI-compatible endpoint |
| `HR_ADAPTER` | `mock` | `mock` or `attendeehrm` |
| `ATTENDEE_API_URL` | | AttendeeHRM API base URL |
| `MEMORY_BACKEND` | `walrus` if a MemWal key is set, else `mock` | |
| `MEMWAL_ACCOUNT_ID`, `MEMWAL_PRIVATE_KEY`, `MEMWAL_SERVER_URL` | | Walrus Memory account, delegate key, relayer |
| `RECALL_MAX_DISTANCE` | `0.75` | Similarity cutoff for message-relevant recall |
| `DB_PATH` | `data/attendee-ai.db` | Local index (tombstones, expiry, in-flight saves) |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated frontend origins |
| `ASSISTANT_NAME` | `Attie` | What the assistant calls itself |
| `PORT` | `8787` | |

## API

All routes except `/health` need `Authorization: Bearer <token>`.

| Route | Purpose |
|---|---|
| `GET /health` | Liveness |
| `GET /me` | Signed-in employee's name, company, whether memory is paused |
| `POST /chat` | `{ messages: [{ role, content }], memory?: boolean }` → `{ reply, memory: { recalled, events }, hr: { lookups, actions } }` |
| `GET /memories` | Everything remembered about this employee |
| `DELETE /memories/:id` | Forget one memory |
| `DELETE /memories` | Forget everything |
| `PUT /memory-settings` | `{ paused: boolean }` to stop saving and using memory |

## Tests

```bash
npm test
```

The suite runs offline against the SDK's `MemWalMock` and a fake HR backend. It covers the memory policy, save/recall/forget, corrections, isolation between employees, the AttendeeHRM adapter's identity checks, and a full chat turn.

## Project layout

```
src/
  server.js           wiring and startup
  app.js              HTTP routes, sign-in check, rate limit
  agent.js            one chat turn: recall → reply with tools → save
  llm.js              model client (tool loop, structured output)
  tools.js            HR tools, bound to the signed-in employee
  hr/                 mock.js (demo company), attendeehrm.js (live adapter)
  memory/
    store.js          Walrus Memory wrapper: save, recall, list, forget
    policy.js         what may be stored; types and expiry
    extract.js        the "what is worth remembering" step
    index-db.js       local SQLite index beside Walrus
scripts/
  chat.mjs            terminal chat client
  memory-spike.mjs    Walrus Memory connection and behaviour check
  authz-probe.mjs     checks an AttendeeHRM backend scopes data to the token
  repro/              minimal reproductions for Walrus Memory reports
```

## Limitations

- **Forget hides; it does not erase.** A forgotten memory stops being recalled immediately, but its encrypted blob stays on Walrus. Permanent deletion needs the account owner's wallet signature (Walrus Memory's security-delete flow) and is not automated here yet.
- **The operator holds the key.** The service uses one Walrus Memory account and a delegate key on the server. Employees' memories are separated by namespace and are not visible to HR admins through this service, but they are not encrypted to a key only the employee holds.
- **The local index matters.** Tombstones and expiry dates live in `data/attendee-ai.db`. Lose it and forgotten memories become recallable again. Back it up, or keep it on a persistent disk when deploying.
- **Saves can fail silently for the employee.** If a Walrus upload fails after the chat moved on, the memory is dropped and only the server log says so.
- **No policy knowledge.** The assistant answers from an employee's own records and memory. It has no company handbook, and says so when asked about policy.
