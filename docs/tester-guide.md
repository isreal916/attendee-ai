# Attie tester guide

_What the people testing Attie follow, 2–8 October 2026. The same guide as a page with copy buttons: [tester-guide.html](tester-guide.html)._

Attie is the HR assistant in AttendeeHRM. It answers from your live HR records and remembers what you tell it about how you work, so you don't have to start from zero every time. This week we want to find out whether that memory actually makes it more useful to you.

**About 10 minutes a day for seven days**, plus a 5-minute kickoff · **your own AttendeeHRM login** → AI Assistant · **one track each**, the one closest to your real work.

## Day 0 · Five-minute kickoff

Before you start, jot down a few true things about your work. You'll use them in place of the examples in the guide, so Attie learns about the real you.

- What you're working on or learning right now
- One goal for this quarter
- How you like answers (short or detailed, any format)
- Something coming up: time off, a course, a deadline
- One or two things you've done recently that you're proud of

## Before you start

- **Be yourself.** The parts in [brackets] are examples. Replace them with things that are true for you, using what you noted at the kickoff, and change any line that doesn't fit. Real answers are the whole point.
- **Start a new chat each day** with the _New chat_ button. Attie should still remember you: that's what we're testing.
- **Keep it work-related.** Don't share health details, pay, passwords or anything about colleagues. Attie is built not to keep those, but there's no need to test it.
- **The first message can take up to a minute** if nobody has used Attie for a while. After that it's quicker.
- **Click _Helpful_** under a reply when what Attie remembered actually helped you. It only counts the click.
- **Write one evidence line a day** (see below), and take a screenshot wherever you see 📸.
- **You're in control.** The panel on the right of the AI Assistant page shows everything Attie remembers. You can correct or forget anything, any time.

## Track A: Learning something new

For someone fairly new to their role, or picking up a new skill. Attie should tailor what-to-learn advice to you and keep track of your progress.

### Day 1 · Introduce yourself

_Thu 2 Oct · Preference and goal_

- **"Please keep your answers [short, with bullet points]."** — A preference: shapes every reply from now on
- **"My goal this quarter is to [ship my first feature on my own]."** — A goal
- **"How many leave days do I have left?"** — Live HR data, never stored in memory

> **Look for:** Under your messages, _I'll remember that · saving…_ changes to _Saved to your memory_ within a minute. 📸 the memory panel.

### Day 2 · An HR question, and what you're working on

_Fri 3 Oct · start a new chat · Story A: your preference, without repeating it_

- **"I'm currently learning [Next.js]. It's my main focus this month."** — Current focus
- **"I work best [in the mornings, before noon]."** — A working preference
- **"What should I focus on learning this week?"** — Should build on what you're learning, in your style

> **Look for:** A short answer that builds on what you're learning, without you repeating it. Click _See answer without memory_ under it. 📸 both answers. Note one line on the difference.

### Day 3 · Start something unfinished

_Sat 4 Oct (or Mon 6) · start a new chat · An open thread_

- **"Can I take [Friday 17 October] off? Please draft the request."** — Attie drafts it. Don't submit it yet
- **"I'm working on [the customer dashboard project]."** — Current focus

### Day 4 · The follow-up

_The next day you use it · start a new chat · Story B: Attie knows something is unfinished_

- **"When is my next shift?"** — Any first question works

> **Look for:** Attie answers, then asks whether you submitted the leave request you drafted. 📸 it, then answer honestly.

- **"I already know how to request leave in the app."** — Something you already know

### Day 5 · Your wins

_Mon 6 Oct · start a new chat · Wins build up_

- **"This week I [finished my first code review]."** — A win
- **"I [fixed the login page bug] and it went live."** — A win
- **"I [learned the basics of Docker]."** — A win
- **"I learn best from [short video tutorials]."** — A preference

### Day 6 · Normal HR use

_Tue 7 Oct · start a new chat · Personal, without getting in the way_

- **"How was my attendance this month?"** — Live HR data
- **"How do I request leave?"** — Should be brief: you said you already know
- **"I'd like [a mentor in frontend architecture]."** — A goal
- **"I'd like to take [a week off at the end of the year]."** — A plan

### Day 7 · Review or planning

_Wed 8 Oct · start a new chat · Story C: your week comes together_

- **"What should I learn after [Next.js]? Help me plan the next two weeks."** — Should connect your focus, goals, wins and learning style

> **Look for:** Click _See answer without memory_. 📸 both. This is the before/after for your track.

- **"What do you remember about me?"** — A summary of your week
- **"Actually, I now prefer [more detailed answers]."** — A correction: the old preference should stop being used

> **Look for:** In the memory panel, correct one memory with the pencil icon and forget one you don't need with the bin icon. 📸 the panel before and after.

## Track B: Shifts & operations

For someone whose day revolves around shifts, attendance and planning time off. Attie should learn your constraints and plans so its answers fit your real week.

### Day 1 · Introduce yourself

_Thu 2 Oct · Preference and goal_

- **"Please reply in [simple, short sentences]."** — A preference: shapes every reply from now on
- **"I prefer [early shifts], and I need to [leave by 4pm on weekdays]."** — A working preference (the constraint, not the reason)
- **"My goal this quarter is to [have no late arrivals]."** — A goal
- **"When is my next shift?"** — Live HR data

> **Look for:** _I'll remember that · saving…_ changes to _Saved to your memory_. 📸 the memory panel.

### Day 2 · An HR question, and what you're working on

_Fri 3 Oct · start a new chat · Story A: your preference, without repeating it_

- **"I'm learning [Excel for stock reports]."** — Current focus
- **"I like a reminder [a day before my shifts change]."** — A preference
- **"How was my attendance this month?"** — Live numbers, framed around your goal, in your style

> **Look for:** Click _See answer without memory_ under the attendance answer. 📸 both. Note one line on the difference.

### Day 3 · Start something unfinished

_Sat 4 Oct (or Mon 6) · start a new chat · An open thread_

- **"I want to take [the week of 22 December] off. Please draft the request."** — Attie checks your balance and drafts it. Don't submit it yet
- **"I'd like to [swap to more morning shifts next month]."** — A plan

### Day 4 · The follow-up

_The next day you use it · start a new chat · Story B: Attie knows something is unfinished_

- **"Do I work this weekend?"** — Any first question works

> **Look for:** Attie asks whether you submitted your December leave request. 📸 it, then answer honestly.

- **"I already know how to clock in on my phone."** — Something you already know

### Day 5 · Your wins

_Mon 6 Oct · start a new chat · Wins build up_

- **"This week I [reorganised the loading bays and trucks waited less]."** — A win
- **"I [trained two new staff on the scanner]."** — A win
- **"I'd like to take [a first-aid course next month]."** — A plan

### Day 6 · Normal HR use

_Tue 7 Oct · start a new chat · Personal, without getting in the way_

- **"How do I clock in on my phone?"** — Should be brief: you said you already know
- **"How many leave days do I have left?"** — Live HR data
- **"I'm learning to use [the new inventory system]."** — Current focus

### Day 7 · Review or planning

_Wed 8 Oct · start a new chat · Story C: your week comes together_

- **"I want to [get my forklift certificate this year]."** — A goal
- **"Help me plan my next two weeks."** — Should use your shifts, constraints, plans and goal together

> **Look for:** Click _See answer without memory_. 📸 both. This is the before/after for your track.

- **"What do you remember about me?"** — A summary of your week
- **"Actually, I now prefer [more detailed answers]."** — A correction: the old preference should stop being used

> **Look for:** In the memory panel, correct one memory with the pencil icon and forget one you don't need with the bin icon. 📸 the panel before and after.

## Track C: Growing into leadership

For someone working towards more responsibility. Attie should collect your wins along the way and turn them into review material when you need it.

### Day 1 · Introduce yourself

_Thu 2 Oct · Preference and goal_

- **"I like [detailed answers with an example]."** — A preference: shapes every reply from now on
- **"My goal is to [become a team lead within two years]."** — A goal
- **"What does my HR profile say about my role?"** — Live HR data: your title comes from HR, not from memory

> **Look for:** _I'll remember that · saving…_ changes to _Saved to your memory_. 📸 the memory panel.

### Day 2 · An HR question, and what you're working on

_Fri 3 Oct · start a new chat · Story A: your preference, without repeating it_

- **"Right now I'm working on [my public speaking]."** — Current focus
- **"I prefer feedback [in writing, so I can come back to it]."** — A preference
- **"How can I start building leadership experience?"** — Should use your goal and focus, in detail

> **Look for:** Click _See answer without memory_. 📸 both. Note one line on the difference.

### Day 3 · Start something unfinished

_Sat 4 Oct (or Mon 6) · start a new chat · An open thread_

- **"I'm planning to [attend a leadership workshop in November]."** — A plan
- **"Please draft leave for [13–14 November] for the workshop."** — Attie drafts it. Don't submit it yet

### Day 4 · The follow-up

_The next day you use it · start a new chat · Story B: Attie knows something is unfinished_

- **"How was my attendance this month?"** — Any first question works

> **Look for:** Attie asks whether you submitted the November leave request. 📸 it, then answer honestly.

- **"I already know how the appraisal process works here."** — Something you already know
- **"This week I [mentored a new intern through onboarding]."** — A win

### Day 5 · Your wins

_Mon 6 Oct · start a new chat · Wins build up_

- **"I [led our weekly team meeting] for the first time."** — A win
- **"I [automated our monthly report and saved the team a day of work]."** — A win

### Day 6 · Normal HR use

_Tue 7 Oct · start a new chat · Personal, without getting in the way_

- **"When is my next shift?"** — Live HR data
- **"I [presented our quarterly results to the department]."** — A win
- **"I'm reading [a book on managing people]."** — Current focus
- **"I want to improve at [giving feedback to colleagues]."** — Current focus

### Day 7 · Review or planning

_Wed 8 Oct · start a new chat · Story C: your week comes together_

- **"Help me prepare for my performance review."** — Should turn the wins from your week into review points, linked to your goal

> **Look for:** Your own wins from earlier days, connected to your goal. Click _See answer without memory_ to compare. 📸 both. This is the most important screenshot.

- **"What do you remember about me?"** — A summary of your week
- **"Actually, I now prefer [more detailed answers]."** — A correction: the old preference should stop being used

> **Look for:** In the memory panel, correct one memory with the pencil icon and forget one you don't need with the bin icon. 📸 the panel before and after.

## Your evidence line, once a day

Add one row a day: the moment that day where Attie remembered something, or should have.

| Day | What I asked | What Attie remembered | With memory vs without | Did it help? Why? |
|---|---|---|---|---|
| Day 2 | "What should I learn this week?" | That I'm learning Next.js and like short answers | With memory: Next.js routing in three bullets. Without: asked what I was learning | Yes, didn't have to explain again |

## What to send back

1. Your evidence lines.
2. Your screenshots, labelled with the day.
3. One or two sentences: the moment Attie remembering something helped most, and anything it got wrong.
4. Anything that broke, looked odd or was slow, with the time it happened.

Your conversations stay private. Attie doesn't store what you write; the team only sees counts (messages, memories), plus whatever you choose to send back.
