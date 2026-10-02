# How to add memory to a support chatbot: an HR assistant that remembers employees between sessions

*Draft. [SQUARE BRACKETS] = still to add before publishing. Target 500–800 words: the body is ~730 now, leaving ~70 for Tester 3. Real-use sections are scripted sessions on real staff accounts and say so; replace or add quotes if colleagues use it freely.*

Every HR chatbot I have used has never met you. Ask "what should I learn next?" and it asks what your job is, every time. Start a leave request, close the tab, and it's gone.

I work on AttendeeHRM, an HR system where employees check leave, shifts, attendance and pay. For Walrus Sessions 8 I built **Attie**, an assistant inside it that answers from live HR records and remembers each employee across conversations using Walrus Memory.

**Stack:** DeepSeek (`deepseek-v4-pro`) through its OpenAI-compatible API, Node.js, the `@mysten-incubation/memwal` SDK, Postgres and Next.js. The code and setup steps are at https://github.com/isreal916/attendee-ai.

## One rule: HR records are live, memory is personal

Leave balances, pay and job titles change and belong to the HR system, so Attie fetches them live and never stores them. Walrus holds what employees choose to share: answer style, goals, what they're learning, plans, unfinished tasks.

On day one I typed "am the hr manager of this company". Attie answered correctly from my profile, then saved "Is the HR manager" as a memory. Right reply, wrong memory, so job titles are now blocked.

## How it works

Each employee's namespace comes from their verified login: `attendee:{company}:{user}`. After each message, a second model call proposes up to three facts; a hard filter drops HR numbers, health details and anything about other people, and the rest is saved as one typed sentence, such as `[goal] Wants to become a tech lead.`

Recall is selective: preferences always; unfinished tasks at the start of a conversation or when you ask what's outstanding; goals and focus for "what should I work on?"; anything else only if relevant. Every memory type has to change what Attie does next.

## Before and after, on real accounts

These are scripted test sessions on two real staff accounts in our company, not yet free use by colleagues.

**Remembering across sessions.** One employee mentioned once that they're learning Next.js, want to become a tech lead, and like short answers. In a new chat they asked, "What should I focus on learning next?"

- *With memory:* "Keep the Next.js momentum, but add one tech-lead skill on top… finish a Next.js project, then start leading small technical discussions."
- *Same question via the app's "See answer without memory" button:* a generic list of troubleshooting, scripting and certifications, ending with "Tell me a bit more".

[SCREENSHOT: the "See answer without memory" comparison]

**An unfinished task.** A second employee asked Attie to draft leave for 21–25 December and said, "I'll submit it later." Later, in a new chat, they asked only "What's my next shift?". Attie answered from the live roster, then added: *"did you get a chance to submit that Official Leave draft for 21–25 Dec?"* Nobody had mentioned leave in that chat.

[SCREENSHOT: the unprompted follow-up]

**HR beats memory.** The same employee said, "I think my leave balance is 20 days." Attie checked the live record and replied: 20 Official plus 5 Casual, so 25 in total. "The 20 days you're thinking of is your Official Leave."

**Isolation.** The second account never saw anything the first employee had shared.

[TESTER 3: achievements and performance review. Add the review answer with and without memory, plus one sentence from the tester in their own words.]

## What broke

**Production failed where development never did.** On Render, every recall failed: "Cannot find package '@mysten/seal'". The SDK loads that peer dependency lazily, so the server started cleanly; a health check running one real recall found it.

**Saves take about 30 seconds.** Attie replies at once and saves in the background, showing "saving…" until Walrus confirms, or Retry if it fails. My first version said "Will remember" immediately, which was a lie whenever a save failed.

**There is no per-memory delete.** The SDK can't delete a single memory, so I keep a table of forgotten IDs and filter every recall against it.

**Relevant isn't the same as similar.** "What should I work on?" shares no words with "wants to become a tech lead", and in testing Attie claimed the employee had no goals. "Anything I still need to take care of?" missed the leave draft the same way. Guidance and "what's outstanding" questions now pull those memory types in directly.
## What I'd tell someone starting

`remember()` and `recall()` worked on day one. The real work was deciding what deserves remembering, recalling as little as possible, and being honest about saving and forgetting. Without memory, Attie still answers HR questions, but employees are back to explaining themselves every time.

[LIVE LINK / VIDEO: short screen recording of a cross-session recall]

[X POST: tag @WalrusProtocol, #WalrusMemory, link this article]
