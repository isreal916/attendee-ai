# How I added long-term memory to an HR chatbot with Walrus Memory (and what broke)

*Draft. Items in [SQUARE BRACKETS] need real screenshots or numbers from the usage period before publishing.*

Every HR chatbot I have used has the same flaw: it has never met you. Ask "what should I focus on this week?" and it asks what your job is. Ask again next month and it asks again.

I work on AttendeeHRM, an HR system where employees check leave, shifts, attendance and pay. It had an assistant panel that matched keywords to canned answers. For Walrus Sessions 8 I replaced it with **Attie**: an assistant that answers from live HR records and remembers the employee across conversations using Walrus Memory.

**Stack:** DeepSeek (`deepseek-v4-pro`, through its OpenAI-compatible API) on Node.js, the `@mysten-incubation/memwal` SDK, a Next.js frontend. Code: https://github.com/isreal916/attendee-ai

## The rule that shaped everything

An HR assistant handles two kinds of facts, and mixing them is dangerous.

- **HR records** (leave balance, attendance, pay, job title) change, and the HR system owns them. Attie fetches these live on every question and never stores them.
- **Personal context** (goals, how you like answers, what you are learning, plans, wins) is what the employee chooses to share. This goes to Walrus Memory.

I learned why the line matters on day one. I typed "am the hr manager of this company" as a test. Attie correctly answered from my real profile ("I see your role as Manager in Technical & Support") — and then saved "Is the HR manager of the company" as a memory. The reply was right and the memory was wrong. Job titles are now blocked from memory entirely.

[SCREENSHOT: the "HR manager" conversation with the "Will remember" chip]

## How Walrus Memory is wired in

Each employee gets their own namespace, built from their verified login: `attendee:{company}:{user}`. On every message:

1. **Recall.** Two searches run in parallel: memories relevant to the message, and the employee's preferences, goals and open threads, which are always included.
2. **Reply.** The model answers, calling HR tools for anything live.
3. **Remember.** A separate step reads only the employee's message and proposes up to three facts. Each passes a hard filter (no HR numbers, no health details, nothing about other people) and is saved as one typed sentence, like `[goal] Wants to become a tech lead.`

The employee sees a "Will remember: …" chip with an Undo button, and a page listing everything Attie holds, each with a forget button.

## Before and after

Same question, same employee, memory switched off and then on. These are from my own testing with a demo account:

**Without memory:** "I don't have any of your goals on file, so I can't tailor this… If you tell me what's on your plate, I can help you shape it into a plan."

**With memory**, in a new conversation days after the employee mentioned learning Next.js and wanting to become a tech lead: "Given your goal to become a tech lead and that you're settling in as a frontend dev learning Next.js, this week I'd focus on: ship one small Next.js thing end to end…"

[REPLACE OR ADD: the same comparison from a real user, with screenshots]

Three behaviours came out of memory that I did not plan at the start:

- **Wins for appraisal time.** Mention "I finished reorganising the loading bays" in passing; weeks later, "what have I achieved?" brings it back.
- **No repeated explanations.** Once you confirm a how-to worked, the next answer is one line.
- **Follow-ups.** Draft a leave request and forget to submit it, and the next conversation asks about it.

[EVIDENCE: N users, N memories each, over N days. One screenshot per user of Attie recalling something from an earlier day.]

## What broke

**Saves are slow.** A save took 26–39 seconds to land on Walrus. Waiting would wreck the chat, so Attie acknowledges at once and uploads in the background.

**You cannot forget one memory.** The SDK has no per-memory delete; its own test mock does, the real client does not. For HR software that is a must, so I keep a small Postgres table of forgotten IDs and filter every recall against it. It works, but lose that table and forgotten memories come back.

**That workaround had a bug.** A memory forgotten while still uploading reappeared for a few seconds, because my code had not yet learned its ID.

**Similarity is not enough.** "Prefers short answers" is not similar to "when is my next shift?", so preferences were not being recalled. They are now fetched by type, not by similarity.

**Smaller things:** the docs list a testnet package ID the staging relayer does not use, and a save can "time out" with a 504 while the job quietly succeeds.

Using DeepSeek instead of Claude or GPT caused no Walrus-specific friction: the SDK does not care which model you run. I did skip its auto-save middleware, because it stores facts from every message without letting me filter them first.

## Would I do it again?

Yes. The memory itself was the easy part: `remember()` and `recall()` worked the first day. The real work was deciding what deserves to be remembered, and making forgetting trustworthy.

[X POST: tag @WalrusProtocol, #WalrusMemory]
