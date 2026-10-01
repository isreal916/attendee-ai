# How I added long-term memory to an HR chatbot with Walrus Memory (and what broke)

*Draft. Items in [SQUARE BRACKETS] need real screenshots or numbers from the testers before publishing.*

Every HR chatbot I have used has the same flaw: it has never met you. Ask "what should I focus on this week?" and it asks what your job is. Ask again next month and it asks again.

I work on AttendeeHRM, an HR system where employees check leave, shifts, attendance and pay. Its assistant panel used to match keywords to canned answers. For Walrus Sessions 8 I replaced it with **Attie**: an assistant that answers from live HR records and remembers the employee across conversations using Walrus Memory.

**Stack:** DeepSeek (`deepseek-v4-pro`) via its OpenAI-compatible API, Node.js, the `@mysten-incubation/memwal` SDK (staging relayer), Postgres, Next.js. Code: https://github.com/isreal916/attendee-ai

## The rule that shaped everything

HR records (leave balance, attendance, pay, job title) change, and the HR system owns them. Attie fetches them live and never stores them. Personal context (how you like answers, goals, what you're learning, plans, wins) is what you choose to share. That goes to Walrus.

I learned why on day one. I typed "am the hr manager of this company". Attie correctly answered from my real profile, then saved "Is the HR manager of the company" as a memory. Right reply, wrong memory. Job titles are now blocked from memory entirely.

[SCREENSHOT: the "HR manager" conversation]

## How it works

Each employee gets a namespace built from their verified login, `attendee:{company}:{user}`. On every message, Attie recalls a small set of memories: preferences always; an unfinished thread on the first message of a conversation; wins and goals when you're preparing for a review; anything else only if it's relevant. In parallel, a second model step reads only your message and proposes up to three facts. A hard filter drops HR numbers, health details and anything about other people, and the rest is saved as one typed sentence like `[goal] Wants to become a tech lead.`

Every memory type has to change what Attie does later. "Already knows how to request leave" means a one-line answer next time. An unsubmitted leave draft means the next conversation asks about it.

## Before and after

I measure this with a script that runs real conversations through DeepSeek, with memories on the real Walrus relayer, and asks each question twice, with memory on and off. A judge model checks each answer against a written criterion. The latest run passed 10 of 10:

- With "prefers short answers" remembered, replies ran **29–43 words across four runs; without memory, 121–148.**
- "Help me prepare for my performance review" turned two remembered wins into review points. Without memory, it started from scratch: "I don't have any of your past wins or goals saved".
- "How many leave days do I have?" returned the live 20, ignoring an old memory that said 30.
- Employee B asking about employee A's hobby got nothing back.

In the app, every personalised reply has "See answer without memory", so testers see the comparison themselves.

[REAL USE: N testers over N days, N memories each, from `npm run report:usage`. One screenshot per tester of Attie recalling something from an earlier day.]

## What broke

**Saves are slow.** A save takes 26–39 seconds. Attie answers at once and saves in the background, showing "saving…" until Walrus confirms. My first version said "Will remember" immediately, which overclaimed whenever a save failed.

**You can't forget one memory.** The real SDK client has no per-memory delete (its test mock does), so I keep a table of forgotten IDs and filter every recall against it.

**Relevance needed measuring.** My first similarity cutoff let through more unrelated memories than relevant ones. A small calibration on the real relayer moved it from 0.75 to 0.68.

**A rule the model followed half the time.** "Follow up on open threads" in the system prompt worked about half the time. Naming the follow-up explicitly for that turn made it reliable.

**Production failed in a way development never did.** Deployed on Render, every recall and save failed: "Cannot find package '@mysten/seal'". The SDK lists it as a peer dependency and only loads it on the first recall, so the server started fine. A health check that runs one real recall found it in minutes.

**The first recall is slow.** After a restart it takes 7–10 seconds to set up its session, and the SDK gives each recall a fixed 15-second deadline. On a free host that sleeps, that matters. Attie now warms the session at startup, retries once, and falls back to the last good copy.

DeepSeek caused no Walrus-specific friction; the SDK doesn't care which model you use. I skipped its auto-save middleware because it stores facts without letting me filter them first.

## What I'd tell someone starting

`remember()` and `recall()` worked on day one. The real work was deciding what deserves to be remembered, recalling as little as possible, and making saving and forgetting honest. If Walrus Memory disappeared tomorrow, Attie would still answer HR questions. But employees would be back to explaining their preferences, goals and unfinished work every single time.

[X POST: tag @WalrusProtocol, #WalrusMemory]
