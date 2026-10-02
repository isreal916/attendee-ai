# Attie real-user testing script

_What the people testing Attie follow. The same script as a page with copy buttons: [tester-guide.html](tester-guide.html)._

## Purpose

You are testing Attie as a real employee, not trying to make the system pass. The goal is to find out whether persistent memory actually improves the employee experience. Don't praise Attie artificially or force a memory to be created: use natural language and let Attie decide what is worth remembering. Each tester completes their assigned scenario with their own AttendeeHRM account.

## Before you start

- Use your own AttendeeHRM account: sign in at [attendeehrm.vercel.app/kcysoft/login](https://attendeehrm.vercel.app/kcysoft/login) and open _AI Assistant_.
- A Walrus save takes about 30 seconds. After you share something, wait until the note under the reply changes from _saving…_ to _Saved to your memory_ before starting a new conversation.
- The first message can take up to a minute if nobody has used Attie for a while.
- There's no command to list memories: the _What Attie remembers_ panel on the right shows everything, and lets you correct (pencil) or forget (bin) any memory.
- Click _Helpful_ under a reply when what Attie remembered genuinely helped. It only counts the click.
- Don't screenshot private HR information unnecessarily.

## Tester 1 — Preference + goal

_"It knows how I like to work."_ Test whether Attie remembers a personal preference and a longer-term goal, then uses both later without the employee repeating them.

### Conversation 1

> **"I'm currently learning Next.js and my goal is to eventually become a tech lead. Also, I prefer short, practical answers rather than long explanations."**

Then continue naturally with:

> **"What should I focus on improving at work this quarter?"**

_Look for:_ Observe whether Attie responds appropriately. Wait until the note under the reply says _Saved to your memory_ (about 30 seconds) before moving on.

### New conversation

Start a *_new conversation__: click _New chat*. Don't tell Attie this is a test.

> **"I have some free time this week. What would be useful for me to work on?"**

_Look for:_ Observe whether Attie uses your learning focus, your career goal and your answer preference without you repeating them.

### Memory check

To check what was remembered, open the _What Attie remembers_ panel on the right of the AI Assistant page. Confirm that useful memories were created.

### Before / after

> **"What should I focus on learning next?"**

Capture the personalised answer. Then click _See answer without memory_ under it, and capture both responses.

### Screenshots to capture

1. The original conversation where the preference and goal were stated.
2. The new conversation where Attie uses them without being reminded.
3. The before/after comparison.
4. The memory panel showing the stored memories.

## Tester 2 — Unfinished leave request

_"It remembers what I left unfinished."_ Test whether Attie remembers something the employee started but did not finish.

### Conversation 1

> **"I'd like to take annual leave from December 21st to December 25th. Can you help me draft the request?"**

_Look for:_ Let Attie use your real HR data where it needs to (for example your leave balance).

Then say:

> **"This looks good. I'll submit it later."**

_Look for:_ Do *_not__ submit the request, and don't say you've submitted it: that tells Attie the task is done. Wait until the note says _Saved to your memory*.

### New conversation

Start a *_new conversation__: click _New chat*. Don't tell Attie this is a test.

> **"What's my next shift?"**

_Look for:_ Let Attie answer from your live HR data. Notice whether it brings up the unfinished leave request on its own.

Then ask naturally:

> **"Is there anything I still need to take care of?"**

_Look for:_ Observe whether Attie remembers the unfinished leave request.

### Follow-up

> **"What was the leave request I was working on?"**

_Look for:_ Attie should identify the unfinished request.

### Memory check

Open the _What Attie remembers_ panel on the right of the AI Assistant page. Confirm the unfinished request is listed under _Unfinished things_.

### Screenshots to capture

1. The original leave-draft conversation.
2. The new conversation where Attie brings up the unfinished request.
3. The memory entry showing the unfinished request.
4. If useful, the live HR answer, showing Attie combining what is true now (HR data) with what you were working on (memory).

## Tester 3 — Achievements + performance review

_"It remembers what I've accomplished."_ Test whether Attie remembers meaningful work achievements and later uses them to give more personal career support.

### Conversation 1

> **"I automated our monthly payroll export today. It used to take me a lot of manual work."**

Continue:

> **"I also helped a new intern understand our reporting process."**

_Look for:_ Let Attie respond normally. Wait until both notes say _Saved to your memory_.

### New conversation

Start a *_new conversation__: click _New chat*. Don't tell Attie this is a test.

> **"I have a performance review coming up. How should I prepare?"**

_Look for:_ Don't mention your earlier achievements. Observe whether Attie uses them to make the advice specific.

### Follow-up

> **"What accomplishments have I mentioned before that could be useful for my review?"**

_Look for:_ Observe whether Attie brings up the remembered work.

### Before / after

Under the review-preparation answer, click _See answer without memory_ and compare the generic response with the personal one.

### Screenshots to capture

1. The original conversation containing the achievements.
2. The new performance-review conversation.
3. The personal answer that refers to your earlier achievements.
4. The memory panel showing the achievement memories (under _Your wins_).
5. The before/after comparison, if the difference is meaningful.

## Trust test — everyone, don't skip

After your main scenario, do at least one of these.

### Memory isolation

Tester 1 must not be able to retrieve Tester 2's memories. Tester 1 asks:

> **"What do you remember about my leave plans?"**

The answer must only use Tester 1's own memory.

### HR authority

If appropriate, say something that conflicts with your HR data, for example:

> **"I think my leave balance is 20 days."**

Attie should use your actual HR record, not your statement. Don't change real HR records to do this test.

### Memory controls

Open the _What Attie remembers_ panel on the right of the AI Assistant page, then correct or forget a memory where appropriate.

Ask about it again and check that the forgotten memory is no longer used.

## Don't

- Tell Attie exactly what memory to create.
- Repeatedly say "remember this".
- Ask leading questions such as "Do you remember that I like short answers?"
- Pretend something happened when it didn't.
- Repeat the same information in every conversation.
- Praise Attie simply because it remembered something.
- Manufacture a successful result.

The goal is to see whether memory works naturally.

## What to record

| Item | Your answer |
|---|---|
| Tester ID | |
| Number of conversations | |
| Memories created | |
| Memories recalled | |
| Memories corrected | |
| Memories forgotten | |
| Memory save failures | |
| Was the personal response actually more useful? | |
| Strongest memory moment | |
| Any incorrect or irrelevant memory | |
| Any privacy or security issue | |

## Final questions

After the test, ask the employee and record the answers word for word:

1. Did Attie's memory make any answer more useful to you than it would have been if you had to explain your context again?
2. What was the most useful thing Attie remembered?

Answers may be quoted in the article, only with the employee's permission.

## For the article

Show three forms of memory, each as conversation A → new conversation → personal response → memory evidence:

1. **"It knows how I like to work."** — Tester 1: preference + goal.
1. **"It remembers what I left unfinished."** — Tester 2: unfinished leave request.
1. **"It remembers what I've accomplished."** — Tester 3: achievements + performance review.

The strongest evidence is when the memory changes what Attie does next, not merely that a memory exists. Use only the strongest real examples.
