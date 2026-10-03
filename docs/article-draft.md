# How to add memory to a support chatbot: an HR assistant that remembers employees between sessions

*Draft. [SQUARE BRACKETS] = still to add before publishing. Target 500–800 words. Numbers from docs/impact-report.md; sessions logged in docs/facilitated-sessions.md; GIFs in docs/evidence/.*

Every HR chatbot I have used has never met you. Ask "what should I learn next?" and it asks what your job is, every time.

I work on AttendeeHRM, an HR system for leave, shifts, attendance and pay. I built **Attie**, an assistant inside it that answers from live HR records and remembers each employee across conversations using Walrus Memory.

Built with DeepSeek and Node.js; code and setup: https://github.com/isreal916/attendee-ai.

## One rule: HR records are live, memory is personal

Leave balances, pay and job titles change and belong to the HR system, so Attie fetches them live and never stores them. Walrus holds what employees choose to share: answer style, goals, what they're learning, plans, unfinished tasks.

Early on, Attie saved "Is the HR manager" because I typed it, so job titles are now blocked.

## How it works

Each employee's namespace comes from their verified login: `attendee:{company}:{user}`. After each message, a second model call proposes up to three facts; a hard filter drops HR numbers, health details and anything about other people, and the rest is saved as one typed sentence, such as `[goal] Wants to become a tech lead.`

Recall is selective: preferences always; unfinished tasks at the start of a conversation; goals for "what should I work on?"; anything else only if relevant.

## Before and after, on real accounts

Attie ran in our live AttendeeHRM from 1 to 3 October on three staff accounts. I drove the sessions from a test script, since we had no outside testers yet. By day three each account held 10 memories, and 58 of 67 replies used memory.

**Remembering across sessions.** One employee mentioned learning Next.js and wanting to become a tech lead. In a new chat, "What should I focus on learning next?" got "Keep the Next.js momentum, but add one tech-lead skill on top". The app's "See answer without memory" button showed a generic list ending "Tell me a bit more".

**An unfinished task.** A second employee asked Attie to draft leave for 21–25 December and said, "I'll submit it later." Later, in a new chat, they asked only "What's my next shift?". Attie answered from the live roster, then added: *"did you get a chance to submit that Official Leave draft for 21–25 Dec?"* Nobody had mentioned leave in that chat. It asked again the next day.

[GIF: docs/evidence/day1-leave-followup.gif]

**HR beats memory.** "I think my leave balance is 20 days" got the live record instead: 20 Official plus 5 Casual, 25 in total.

**Two days of context in one answer.** On day one a third employee mentioned automating the payroll export and helping an intern. On day two: a payroll-specialist goal, a zero-correction September close, and "numbered checklists work best for me". Then, in a new chat: "I have a 1:1 with my manager tomorrow. What should I bring up?"

- *With memory:* a numbered list opening with the September close and the automated export as "concrete proof toward your payroll specialist goal".
- *Without memory:* "Since I don't have your goals or recent context yet…"

[GIF: docs/evidence/day2-account3-one-on-one.gif]

**Isolation.** Asked about "my leave plans", the third employee got nothing from a colleague's stored December leave.

## Model, runtime, and the Walrus Memory friction

**Model:** DeepSeek `deepseek-v4-pro` for replies and `deepseek-flash` for choosing what to remember, via DeepSeek's OpenAI-compatible API. **Runtime:** Node.js 24 (Hono) on Render's free tier, MemWal SDK 0.1.8 on the staging relayer, Postgres on Neon. Walrus Memory never touches the model: I call `remember()` and `recall()` myself, and skipped the SDK's auto-save middleware so every fact passes my filter first.

- **A dependency that fails only in production.** The default client imports `@mysten/seal` lazily, so Render started cleanly and then every recall failed. A health check that runs one real recall caught it.
- **Saves take ~30 seconds, and a wait that gives up looks like a 504.** Attie replies at once and saves in the background, with idempotency keys so a retry never stores twice, and says "saving…" until Walrus confirms.
- **No per-memory delete** in the real client (the mock has one), so forgotten IDs live in a table that filters every recall.
- **A slow first recall** (7–10 s against a fixed 15 s deadline); Attie warms up at start and retries once.

[ISSUE LINKS: MemWal GitHub issues once filed]

**My own bug: relevant isn't similar.** "What should I work on?" and "my 1:1 with my manager" share no words with "wants to become a tech lead", so Attie asked for goals it already had. Such questions now pull goals and wins in directly.

## What I'd tell someone starting

`remember()` and `recall()` worked on day one. The real work was deciding what deserves remembering, recalling as little as possible, and being honest about saving and forgetting.

Recordings, session log and numbers are in the repo's `docs/`.

[X POST: tag @WalrusProtocol, #WalrusMemory, link this article]
