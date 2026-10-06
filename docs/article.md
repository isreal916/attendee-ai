# How to add memory to a support chatbot: an HR assistant that remembers employees between sessions

Every HR chatbot I have used has never met you.

Ask “what should I learn next?” and it asks what your job is, every time.

I work on AttendeeHRM, an HR system for leave, shifts, attendance and pay. I built **Attie**, an assistant inside it that answers from live HR records and remembers each employee across conversations using Walrus Memory.

Built with DeepSeek and Node.js. Code and setup: [GitHub](https://github.com/isreal916/attendee-ai).

**Try it:** [Public demo](https://attendee-ai.onrender.com/demo) with a made-up company. Pick an employee, tell Attie something, start a new chat, and click a memory to inspect its blob on Walruscan.

## One rule: HR records are live, memory is personal

Leave balances, pay and job titles change and belong to the HR system, so Attie fetches them live and never stores them as memory.

Walrus holds what employees choose to share:

- answer preferences
- goals
- what they are learning
- plans
- unfinished tasks
- achievements

The HR system is always the source of truth. Memory never overrides an HR record.

Early on, I typed that I was the HR manager. Attie correctly answered from my HR profile, but also tried to save the claim as a memory.

The answer was right. The memory was wrong.

That failure led me to block current job titles, roles and authority from memory entirely.

## How it works

Each employee gets a namespace derived from their verified login:

`attendee:{company}:{user}`

Nothing sent by the browser or model can change it.

After each message, a separate model call proposes up to three facts worth remembering. A deterministic policy then filters them. HR numbers, health details, role claims and anything about other people are rejected.

A surviving fact is stored as a typed sentence such as:

`[goal] Wants to become a tech lead.`

Recall is selective:

- preferences are always available
- unfinished tasks are checked at the start of a conversation
- goals are pulled for questions such as “what should I work on?”
- everything else is recalled only when relevant

The point isn't to remember everything.

It's to remember the smallest amount of personal context that can change what Attie does later.

## Before and after, on real accounts

Attie ran against our live AttendeeHRM system using three staff accounts over our real-user test period. I drove the sessions from a test script because we did not have outside testers.

The important part wasn't the number of memories created. It was whether a memory changed a later interaction.

### Remembering across sessions

One employee mentioned that they were learning Next.js and wanted to become a tech lead.

In a new chat, they asked:

> What should I focus on learning next?

With memory, Attie replied:

> “Keep the Next.js momentum, but add one tech-lead skill on top…”

The app's **See answer without memory** comparison instead produced a generic list and ended by asking the employee to provide more context.

The employee didn't have to repeat their goal.

### An unfinished task

A second employee asked Attie to draft leave for December 21–25 and said:

> “I'll submit it later.”

Later, in a new conversation, they asked only:

> What's my next shift?

Attie answered from the live roster, then added:

> “Did you get a chance to submit that Official Leave draft for 21–25 Dec?”

Nobody had mentioned leave in that conversation.

It surfaced an unfinished task from an earlier conversation while still using the HR system for the current shift.

It even asked about the draft again the following day.

*[Recording: the unprompted follow-up](https://github.com/isreal916/attendee-ai/blob/main/docs/evidence/day1-leave-followup.gif)*

The strongest part of this example is what happens when memory is disabled: the assistant can still answer the shift question, but it has no knowledge of the unfinished leave request.

### HR beats memory

An employee said:

> “I think my leave balance is 20 days.”

Attie checked the live HR record instead.

The actual balance was 20 Official plus 5 Casual: 25 days total.

The remembered statement did not become a source of truth.

### Two days of context in one answer

A third employee mentioned, on day one, that they had automated the payroll export and helped an intern.

On day two, they added a goal of becoming a payroll specialist, a zero-correction September close, and a preference for numbered checklists.

Then, in a new chat:

> I have a 1:1 with my manager tomorrow. What should I bring up?

With memory, Attie produced a numbered list beginning with the September close and automated export as concrete evidence toward the payroll-specialist goal.

Without memory, it responded:

> “Since I don't have your goals or recent context yet…”

That is the behavior I wanted to build: not a chatbot that remembers trivia, but one that can connect things an employee told it at different points in time.

*[Recording: the 1:1 answer, with and without memory](https://github.com/isreal916/attendee-ai/blob/main/docs/evidence/day2-account3-one-on-one.gif)*

### Isolation

We also tested whether memories crossed employee boundaries.

They didn't.

When the third employee asked about their leave plans, Attie did not surface another employee's stored December leave.

Each employee's memory namespace comes from their authenticated identity.

## What Walrus Memory taught me

The integration itself was surprisingly small.

The difficult part was everything around it.

Walrus Memory never touches the model directly. Attie explicitly calls `remember()` and `recall()`, and I skipped the SDK's automatic save middleware so every proposed memory passes through my own policy first.

That exposed several practical problems.

### A dependency that fails only in production

The default client imports `@mysten/seal` lazily.

The application therefore started successfully on Render, but every real recall failed.

A health check that performs an actual recall caught the problem.

A normal “server is running” health check would not have.

### Saves take about 30 seconds

A Walrus save can take roughly 30 seconds.

Waiting for it before returning the assistant's answer made the interaction unacceptable and could surface as a 504.

So Attie replies immediately and saves in the background.

The UI says:

> “I'll remember that · saving…”

and only changes to a confirmed state after Walrus confirms the save.

Retries use an idempotency key so a failed/repeated upload doesn't create duplicate memories.

### Forgetting is not the same as deletion

The current client does not expose a per-memory delete operation.

When an employee forgets a memory, Attie immediately tombstones its ID locally and filters it from future recalls.

That means Attie stops using the memory, but the underlying encrypted Walrus blob is not permanently deleted by this implementation.

Permanent deletion through Walrus's security-delete mechanism is not automated yet.

That distinction matters, so I don't describe the current feature as “permanent deletion.”

### A slow first recall

The first recall after startup can take 7–10 seconds while the encrypted session is established, against a fixed 15-second deadline.

Attie warms the connection at startup and retries once when a recall fails.

Each of these issues is documented with reproduction steps in [the Walrus Memory reports](https://github.com/isreal916/attendee-ai/blob/main/docs/walrus-memory-reports.md).

### My own bug: relevant isn't similar

One of the most interesting failures wasn't Walrus.

It was my recall strategy.

I initially relied too heavily on semantic similarity.

A question like:

> “What should I work on?”

doesn't necessarily share words with:

> “Wants to become a tech lead.”

Likewise:

> “I have a 1:1 with my manager tomorrow. What should I bring up?”

doesn't look semantically identical to a stored achievement.

Attie therefore sometimes asked for context it already had.

The fix wasn't simply lowering the similarity threshold.

Some questions have known behavioral meaning.

Questions about what to work on should pull relevant goals and focus. Performance-review and 1:1 preparation should consider relevant goals and achievements. “What am I still working on?” should check unfinished threads.

The lesson was simple:

**Relevant isn't the same as similar.**

## What I'd tell someone starting

`remember()` and `recall()` worked on day one.

The real work was deciding what deserves remembering, when it should be recalled, and how to be honest about saving and forgetting.

The best memory system isn't the one that remembers the most.

It's the one that remembers the right things, for the right person, at the right moment.

Recordings, session logs and the supporting numbers are in the repository's [docs folder](https://github.com/isreal916/attendee-ai/tree/main/docs).

#WalrusMemory
