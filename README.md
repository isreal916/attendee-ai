# Attendee AI

**An HR assistant that remembers the employee.**

Most HR chatbots forget you the moment the conversation ends. Every time, you explain your role, your goals and how you like answers all over again, and you get the same generic reply as everyone else.

Attie, the assistant in [AttendeeHRM](https://attendeehrm.vercel.app), combines two sources:

```
AttendeeHRM    →  what is true right now     leave, shifts, attendance, pay, job title
Walrus Memory  →  what matters about you     how you like answers, goals, current focus,
                                             plans, unfinished things, wins
```

The HR system is always the source of truth. Memory holds only what the employee chose to share, and never overrides an HR record.

## What that looks like over a week

*Assembled from our test runs: every quoted reply is real output from the real model with memories on the real Walrus relayer, but the memories were set up for each scenario rather than built over one person's actual week. Real-user examples from the 2–8 October testing will replace it.*

- **Day 1.** "I'm learning Next.js. I want to become a tech lead." Attie answers, and shows *I'll remember that*.
- **Day 3.** "Can I take 21–25 December off? Draft it." Attie checks the live leave balance and drafts the request, which the employee doesn't submit.
- **Day 4, new conversation.** "When is my next shift?" Attie gives the shift from the roster, then: *"By the way, did you get a chance to submit that annual leave request for 21–25 December? It's still sitting in draft."* Without memory, it gives only the shift.
- **Days 2–6.** "I mentored a new intern." "I automated the payroll export." Each is kept as a win.
- **Day 7.** "Help me prepare for my performance review." With memory: *"Here's a starter set of review points drawn from what you've shared with me — not from any official record. Goal: move into a tech lead role. Both of your wins this year point straight at that…"* Without memory: *"I don't have any of your past wins or goals… so we'll build this fresh."*

Every personalised reply in the app has **See answer without memory**, so anyone can check the difference for themselves.

## Evidence

### Product evidence: real employees

Three AttendeeHRM employees use Attie from 2 to 8 October 2026, following [the tester guide](docs/tester-guide.md): their own logins, their own details, about ten minutes a day.

- `npm run report:usage -- --md` writes [docs/impact-report.md](docs/impact-report.md): per employee, days used, sessions, memories created, kept, recalled, corrected and forgotten, save failures and "Helpful" clicks, plus how often each memory behaviour fired. It reads counts only; no conversation text is stored anywhere.
- Before/after examples come from the testers themselves: a screenshot of *See answer without memory* and one line on whether it helped.

### Engineering evidence

These show the mechanism works. They are not proof that it is useful; that comes from the employees above.

- `npm test` — 44 tests: memory creation (useful kept; sensitive, HR and role claims rejected), recall precision, forgetting, correction, expiry, isolation between employees, HR authority over memory, memory off, failed saves and retries, a slow or unreachable relayer, usage tracking, and the AttendeeHRM adapter's identity checks.
- `npm run eval:behaviour` — ten conversations through the real model with memories on the real relayer, each compared with memory on and off and graded by a judge model: [docs/eval-results.md](docs/eval-results.md) (10/10 on 1 October).
- [docs/trust-checklist.md](docs/trust-checklist.md) — the same attacks (isolation, role claims, sensitive data, forgetting, correction, memory off, save failure) checked by hand on the live system.
- `npm run calibrate:recall` — measures recall distances on the relayer; the cutoff (0.68) comes from it.

## Built with

- **Model and runtime:** DeepSeek (`deepseek-v4-pro` for replies, `deepseek-flash` for the memory step) through its OpenAI-compatible API, on Node.js. Any OpenAI-compatible provider works; Groq is preconfigured as an alternative.
- **Memory:** Walrus Memory through the `@mysten-incubation/memwal` TypeScript SDK (staging relayer).
- **HR data:** the AttendeeHRM API, called with the employee's own login (or a built-in demo company).
- Built for Walrus Sessions 8, "Chatbots That Remember".

## The one rule that shapes everything

| Information | Where it lives | Why |
|---|---|---|
| Leave balance, attendance, shifts, pay, job title, department | The HR system, fetched live on every question | It changes, and the HR system is the source of truth |
| Goals, answer preferences, what you are learning, plans, unfinished things, wins | Walrus Memory | Personal context the employee chose to share |

Memory never holds an HR record, and a remembered fact never overrides one. If an employee says "I'm the HR manager" and the HR record says otherwise, the assistant goes with the record, and the claim is not stored.

## How a chat turn works

```
employee message
   │
   ├─ recall from Walrus Memory  (this employee's namespace only)
   │     • preferences, always
   │     • open threads, on the first message of a conversation
   │     • wins and goals, when preparing for a review
   │     • anything else only if relevant to the message (at most 6)
   │
   ├─ reply ──────────────────────────────┐   ├─ memory step (runs alongside the reply)
   │   model + HR tools, called with the  │   │   reads only the employee's message,
   │   employee's own access token        │   │   proposes 0–3 facts worth keeping
   │                                      │   │
   ▼                                      ▼   ▼
reply ("Personalised" · "Live HR data")         policy screen → save to Walrus in the background
```

- **One namespace per employee** (`attendee:{companyId}:{userId}`), derived from the verified sign-in. Nothing the browser or the model sends can change it.
- **Saves never block the chat, and never overclaim.** A Walrus save took 26–39 seconds in our tests, so it happens in the background. The chat shows "I'll remember that · saving…" (with Undo) and changes to "saved" only once Walrus confirms. A failed upload is retried once automatically; if it still fails it is shown as "Couldn't save" with a Retry button — never silently dropped and never recalled. While uploading, a memory is already usable in the next message, survives a page refresh, and resumes if the service restarts.
- **Recall is selective.** The aim is the smallest set of memories that changes this reply. The similarity cutoff (0.68) was calibrated on the real relayer with `npm run calibrate:recall`: at the earlier 0.75, more unrelated memories got through than relevant ones.
- **Forgetting.** Walrus Memory has no call to forget a single memory, so a forgotten or corrected memory is tombstoned in a small local index and filtered out of every recall. See [Limitations](#limitations).
- **Before and after, on any reply.** Every personalised reply has "See answer without memory", which asks the same question again with memory off and shows both. Memory can also be switched off for a whole chat.

## What is never remembered

Every save passes a deterministic screen ([src/memory/policy.js](src/memory/policy.js)), whatever the model proposed:

- HR records and numbers: leave balances, attendance, pay, shift times
- Current job title, role or authority (that comes from the HR record)
- Health, religion, ethnicity, sexuality, politics, union membership
- Complaints or opinions about a manager or colleague; anything about another person
- Credentials, bank or ID details

## What each memory type is for

A type exists only because it changes what Attie does later:

| Type | Example | What changes later | Recalled | Kept for |
|---|---|---|---|---|
| `preference` | Prefers short answers | Every reply's length, format and language | Always | Until changed |
| `goal` | Wants to become a tech lead | Growth advice; review prep | When relevant, and for reviews | Until changed |
| `focus` | Learning Next.js | "What next?" starts from where they are | When relevant | 180 days |
| `plan` | Wants the week of 21 December off | Leave and planning answers use it | When relevant | Until a week after its date |
| `open_thread` | Drafted a leave request, not yet submitted | A one-line follow-up in the next conversation | First message of a conversation | 30 days |
| `achievement` | Automated the payroll export | Turned into review points when preparing for a review | For review questions | 400 days |
| `knows` | Already knows how to submit a leave request | A one-line answer instead of the walkthrough | When relevant | 180 days |

A `context` type existed earlier; it changed no specific behaviour, so it is no longer saved (older memories of that type still display). Every memory shows the model when it was shared, so a goal from months ago is checked before being relied on. The memory page groups memories by these purposes, says why each was remembered ("You told me", "From a leave draft", "You edited this"), and lets the employee correct, forget or retry each one.

The first time an employee chats, Attie offers a few one-tap starters ("Keep your answers short", "I'm learning…") instead of a questionnaire, and asks once in its first reply how they like answers, what they are working on and one goal for the quarter.

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

## Deploy

The service is a long-running Node process (Walrus uploads finish in the background after a reply), and it needs its small index to survive restarts. Two ways to give it that:

### Render + Neon (free tiers)

The index lives in a Postgres database, so the host needs no disk.

1. Create a Postgres database, for example a free [Neon](https://neon.com) project, and copy its connection string. The service creates its tables (`attie_*`) on first start.
2. On [Render](https://render.com): New → Blueprint → pick this repo. `render.yaml` defines the service; Render then asks for the values it does not store in the repo:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Postgres connection string |
   | `DEEPSEEK_API_KEY` | your model key |
   | `MEMWAL_ACCOUNT_ID`, `MEMWAL_PRIVATE_KEY` | your Walrus Memory account and delegate key |
   | `ATTENDEE_API_URL` | your AttendeeHRM API base URL (or set `HR_ADAPTER=mock` for the demo company) |
   | `CORS_ORIGINS` | your frontend's origin(s), comma-separated, no trailing slash |

3. When it is live, check two addresses:
   - `https://<your-service>.onrender.com/health` lists the backends in use, including the Walrus relayer. The SDK silently defaults to the mainnet relayer, where a staging account does not exist, so check it names the one your account is on.
   - `https://<your-service>.onrender.com/health/memory` runs one real recall and reports how long it took, or the exact error.
4. Point the frontend at the service (for the AttendeeHRM frontend: `NEXT_PUBLIC_ATTY_API_URL`).

A free Render service sleeps after a quiet spell; the first message afterwards waits for it to wake.

If you create the service by hand instead of from the blueprint, set every variable in the table above yourself, including `MEMWAL_SERVER_URL` and `NODE_VERSION=24`. The service depends on `@mysten/seal` and `@mysten/sui` directly: the Walrus Memory SDK lists them only as peer dependencies and loads them on the first recall, so a build that skips peer dependencies starts fine and then fails every recall and save.

If you already ran the service locally, copy the local index across once, so forgotten memories stay forgotten:

```bash
npm run migrate:index
```

### A host with a persistent disk (e.g. Railway)

Leave `DATABASE_URL` unset, mount a volume at `/data` and set `DB_PATH=/data/attendee-ai.db`. `railway.json` sets the start command and health check.

Either way, memory uploads that were in flight when the service restarted are resumed at startup.

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
| `RECALL_MAX_DISTANCE` | `0.68` | Similarity cutoff for message-relevant recall (calibrated, see above) |
| `DATABASE_URL` | | Postgres connection string for the index. If unset, a local SQLite file is used |
| `DB_PATH` | `data/attendee-ai.db` | The local SQLite index (tombstones, expiry, in-flight saves) |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated frontend origins |
| `ASSISTANT_NAME` | `Attie` | What the assistant calls itself |
| `PORT` | `8787` | |

## API

All routes except `/health` and `/health/memory` need `Authorization: Bearer <token>`.

| Route | Purpose |
|---|---|
| `GET /health` | Liveness, and which backends are in use (HR source, memory, relayer, index, model, allowed origins) |
| `GET /health/memory` | One real recall against the relayer: how long it took, or the error. At most one check a minute |
| `GET /me` | Signed-in employee's name, company, whether memory is paused |
| `POST /chat` | `{ messages: [{ role, content }], memory?: boolean, compare?: boolean }` → `{ reply, memory: { recalled, events }, hr: { lookups, actions } }`. `compare` replays a question without memory and is not counted as usage |
| `GET /memories` | `{ memories, stale }` — everything remembered about this employee. If the relayer cannot be reached, `stale` is true and the list is the last good copy |
| `PUT /memories/:id` | `{ text }` — correct a memory; the old one stops being recalled |
| `POST /memories/:id/retry` | Try a failed save again |
| `DELETE /memories/:id` | Forget one memory |
| `DELETE /memories` | Forget everything |
| `PUT /memory-settings` | `{ paused: boolean }` to stop saving and using memory |
| `POST /feedback` | `{ helpful: boolean }` — counted for the usage report, nothing else stored |

## Tests

```bash
npm test
```

The suite runs offline against the SDK's `MemWalMock` and a fake HR backend. It covers the memory policy, save/recall/forget, corrections, expiry, isolation between employees, HR authority over memory, memory off, save failures and retries, a slow or unreachable relayer, usage tracking, the AttendeeHRM adapter's identity checks, and full chat turns. Set `TEST_DATABASE_URL` to also run the index tests against Postgres.

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
    index-db.js       the index beside Walrus: SQLite backend
    index-pg.js       the same index on Postgres
scripts/
  chat.mjs            terminal chat client
  memory-spike.mjs    Walrus Memory connection and behaviour check
  authz-probe.mjs     checks an AttendeeHRM backend scopes data to the token
  migrate-index.mjs   copies a local SQLite index into Postgres
  eval-behaviour.mjs  real-model behaviour evaluation (writes docs/eval-results.md)
  calibrate-recall.mjs  measures recall distances on the real relayer
  report-usage.mjs    per-employee usage counts
  repro/              minimal reproductions for Walrus Memory reports
```

## Limitations

- **Forget hides; it does not erase.** A forgotten memory stops being recalled immediately, but its encrypted blob stays on Walrus. Permanent deletion needs the account owner's wallet signature (Walrus Memory's security-delete flow) and is not automated here yet.
- **The operator holds the key.** The service uses one Walrus Memory account and a delegate key on the server. Employees' memories are separated by namespace and are not visible to HR admins through this service, but they are not encrypted to a key only the employee holds.
- **The index matters.** Tombstones and expiry dates live in the index (Postgres, or the local SQLite file). Lose it and forgotten memories become recallable again. Use a real database or a persistent disk when deploying.
- **The relayer's first recall is slow.** After the service starts, the first recall takes 7–10 seconds while the SDK sets up its encrypted session, and the SDK gives every recall a fixed 15-second deadline. On a host that sleeps, that can fail the first request. The service warms the session at startup and every 9 minutes, retries a failed recall once, and falls back to the last good list (still filtered by what was forgotten since) when the relayer cannot be reached.
- **Saves are slow and rate-limited.** A save takes about 30 seconds, and the managed relayer allows 60 weighted requests a minute per delegate key: saving many memories at once hits it. Failed saves are retried once and then shown to the employee, but a burst of activity across many employees on one key would need a self-hosted relayer or several keys.
- **No policy knowledge.** The assistant answers from an employee's own records and memory. It has no company handbook, and says so when asked about policy.
