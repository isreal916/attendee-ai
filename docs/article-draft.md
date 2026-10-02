# How to add memory to a support chatbot: an HR assistant that remembers employees between sessions

*Draft. [SQUARE BRACKETS] = still to add before publishing. Target 500–800 words (~790 now). Real-use sections are still scripted sessions on real staff accounts and say so. Before publishing: replace with the testers' own use over several days, 10+ memories each, numbers from docs/impact-report.md.*

Every HR chatbot I have used has never met you. Ask "what should I learn next?" and it asks what your job is, every time. Start a leave request, close the tab, and it's gone.

I work on AttendeeHRM, an HR system for leave, shifts, attendance and pay. I built **Attie**, an assistant inside it that answers from live HR records and remembers each employee across conversations using Walrus Memory.

Built with DeepSeek and Node.js; code and setup: https://github.com/isreal916/attendee-ai.

## One rule: HR records are live, memory is personal

Leave balances, pay and job titles change and belong to the HR system, so Attie fetches them live and never stores them. Walrus holds what employees choose to share: answer style, goals, what they're learning, plans, unfinished tasks.

On day one Attie saved "Is the HR manager" because I typed it. Right reply, wrong memory, so job titles are now blocked.

## How it works

Each employee's namespace comes from their verified login: `attendee:{company}:{user}`. After each message, a second model call proposes up to three facts; a hard filter drops HR numbers, health details and anything about other people, and the rest is saved as one typed sentence, such as `[goal] Wants to become a tech lead.`

Recall is selective: preferences always; unfinished tasks at the start of a conversation; goals for "what should I work on?"; anything else only if relevant.

## Before and after, on real accounts

These are scripted test sessions on three real staff accounts in our company, not yet free use by colleagues.

**Remembering across sessions.** One employee mentioned once that they're learning Next.js, want to become a tech lead, and like short answers. In a new chat they asked, "What should I focus on learning next?"

- *With memory:* "Keep the Next.js momentum, but add one tech-lead skill on top… finish a Next.js project, then start leading small technical discussions."
- *Via the app's "See answer without memory" button:* a generic list ending "Tell me a bit more".

[SCREENSHOT: the "See answer without memory" comparison]

**An unfinished task.** A second employee asked Attie to draft leave for 21–25 December and said, "I'll submit it later." Later, in a new chat, they asked only "What's my next shift?". Attie answered from the live roster, then added: *"did you get a chance to submit that Official Leave draft for 21–25 Dec?"* Nobody had mentioned leave in that chat.

[SCREENSHOT: the unprompted follow-up]

**HR beats memory.** "I think my leave balance is 20 days" got the live record instead: 20 Official plus 5 Casual, 25 in total.

**Wins, ready for a review.** A third employee mentioned in passing that they'd automated the monthly payroll export and helped a new intern learn the reporting process. In a new chat they asked, "I have a performance review coming up. How should I prepare?"

- *With memory:* the two wins as talking points, with what evidence to bring ("roughly how many hours per month it now saves").
- *Without memory:* "tell me about your wins… What are you most proud of?"

[QUOTE: one sentence from a tester in their own words, if they agree]

**Isolation.** Asked about "my leave plans", the third employee got "I don't have any leave plans from you", though a colleague's December leave is stored for the same company.

## Model, runtime, and the Walrus Memory friction

**Model:** DeepSeek `deepseek-v4-pro` for replies and `deepseek-flash` for choosing what to remember, via DeepSeek's OpenAI-compatible API. **Runtime:** Node.js 24 (Hono) on Render's free tier, MemWal SDK 0.1.8 on the staging relayer, Postgres on Neon. Walrus Memory never touches the model: I call `remember()` and `recall()` myself, and skipped the SDK's auto-save middleware so every fact passes my filter first.

- **A dependency that fails only in production.** The default client imports `@mysten/seal` lazily, so Render started cleanly and then every recall failed. A health check that runs one real recall caught it.
- **Saves take ~30 seconds, and a wait that gives up looks like a 504.** Attie replies at once and saves in the background, with idempotency keys so a retry never stores twice, and says "saving…" until Walrus confirms.
- **No per-memory delete** in the real client (the mock has one), so forgotten IDs live in a table that filters every recall.
- **A slow first recall** (7–10 s against a fixed 15 s deadline) on a host that sleeps; Attie warms up at start and retries once.

[ISSUE LINKS: MemWal GitHub issues once filed]

**My own bug: relevant isn't similar.** "What should I work on?" shares no words with "wants to become a tech lead", so Attie once said the employee had no goals. Such questions now pull goals in directly.

## What I'd tell someone starting

`remember()` and `recall()` worked on day one. The real work was deciding what deserves remembering, recalling as little as possible, and being honest about saving and forgetting.

[LIVE LINK / VIDEO: short screen recording of a cross-session recall]

[X POST: tag @WalrusProtocol, #WalrusMemory, link this article]
