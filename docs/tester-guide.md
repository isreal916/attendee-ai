# Attie tester guide

_Day-by-day prompts for the people testing Attie, 2–8 October 2026. The same guide as a page with copy buttons: [tester-guide.html](tester-guide.html)._

Attie is the HR assistant in AttendeeHRM. It answers from your live HR records and remembers what you tell it about how you work, so you don't have to repeat yourself. This week we want to see whether that memory actually makes it more useful to you.

**About 10 minutes a day** · **your own AttendeeHRM login** → AI Assistant · **one track each**, the one closest to your real work.

## Before you start

- Be yourself. The parts in [square brackets] are examples. Replace them with things that are true for you, and change any line that doesn't fit. Real answers are the whole point.
- Start a new chat each day with the New chat button. Attie should still remember you; that is what we're testing.
- Keep it work-related. Don't share health details, pay, passwords, or anything about colleagues. Attie is built not to keep those, but there's no need to test it.
- The first message can take up to a minute if nobody has used Attie for a while. After that it's quicker.
- Click "Helpful" under a reply when what Attie remembered actually helped you. It only counts the click.
- Take a screenshot wherever you see the 📸 tag, and send them at the end.
- You're in control. The panel on the right of the AI Assistant page shows everything Attie remembers. You can correct or forget anything, any time.

Text in [square brackets] is an example: replace it with something true for you.

## Track A: Learning something new

For someone fairly new to their role, or picking up a new skill. Attie should start tailoring what-to-learn advice to you and keep track of your progress.

### Day 1 · Introduce yourself

_Thu 2 Oct_

- **"Please keep your answers [short, with bullet points]."** — A preference: changes every reply from now on
- **"I'm currently learning [Next.js]. It's my main focus this month."** — Current focus
- **"My goal this quarter is to [ship my first feature on my own]."** — A goal
- **"How many leave days do I have left?"** — Live HR data, never stored in memory

> Look for: "I'll remember that" under your messages, changing from saving… to saved within a minute. 📸 the memory panel at the end.

### Day 2 · See if it remembers

_Fri 3 Oct · start a new chat_

- **"What should I focus on learning this week?"** — Should build on what you're learning, in your preferred style
- **"I already know how to request leave in the app."** — Something you already know: Attie won't explain it again
- **"I'm working on [the customer dashboard project]."** — Current focus
- **"I work best [in the mornings, before noon]."** — A working preference

> Look for: a short answer that mentions what you're learning without you repeating it. Under that reply, click See answer without memory. 📸 both answers together.

### Day 3 · Something unfinished, and a win

_Sat 4 – Mon 6 Oct · start a new chat_

- **"Can I take [Friday 17 October] off? Please draft the request."** — Attie drafts it; you don't need to submit it yet
- **"This week I [finished my first code review]."** — A win, kept for review time
- **"I want to get better at [testing React components]."** — Current focus

### Day 4 · The follow-up

_Next day · start a new chat_

- **"When is my next shift?"** — Any first question works

> Look for: Attie answering, then asking whether you submitted the leave request you drafted. 📸 this one, then answer honestly.

- **"How do I request leave?"** — It should be brief, because you said you already know
- **"I [fixed the login page bug] and it went live."** — Another win

### Day 5 · Building on it

_Tue 7 Oct · start a new chat_

- **"I'd like a mentor in [frontend architecture]."** — A goal
- **"This week I learned [the basics of Docker]."** — A win
- **"I learn best from [short video tutorials]."** — A preference
- **"What should I learn after [Next.js]?"** — Should connect your focus, goals and what you've done

## Track B: Shifts & operations

For someone whose day revolves around shifts, attendance and planning time off. Attie should learn your constraints and plans so its answers fit your real week.

### Day 1 · Introduce yourself

_Thu 2 Oct_

- **"Please reply in [simple, short sentences]."** — A preference: changes every reply from now on
- **"I prefer [early shifts], and I need to [leave by 4pm on weekdays]."** — A working preference (just the constraint, not the reason)
- **"When is my next shift?"** — Live HR data
- **"My goal this quarter is to [have no late arrivals]."** — A goal

> Look for: "I'll remember that" changing from saving… to saved. 📸 the memory panel at the end.

### Day 2 · See if it remembers

_Fri 3 Oct · start a new chat_

- **"How was my attendance this month?"** — Live numbers, framed around your goal
- **"I already know how to clock in on my phone."** — Something you already know
- **"I like a reminder [a day before my shifts change]."** — A preference
- **"I'm learning [Excel for stock reports]."** — Current focus

> Look for: an answer in your style that connects to your no-late-arrivals goal. Click See answer without memory under it. 📸 both answers.

### Day 3 · Plans and a win

_Sat 4 – Mon 6 Oct · start a new chat_

- **"I want to take [the week of 22 December] off. Please draft the request."** — Attie checks your balance and drafts it
- **"This week I [reorganised the loading bays and trucks waited less]."** — A win
- **"I'd like to [swap to more morning shifts next month]."** — A plan

### Day 4 · The follow-up

_Next day · start a new chat_

- **"Do I work this weekend?"** — Any first question works

> Look for: Attie asking whether you submitted your December leave request. 📸 this, then answer honestly.

- **"How do I clock in on my phone?"** — It should be brief, because you said you already know
- **"I'm learning to use [the new inventory system]."** — Current focus
- **"I [trained two new staff on the scanner]."** — Another win

### Day 5 · Building on it

_Tue 7 Oct · start a new chat_

- **"I want to [get my forklift certificate] this year."** — A goal
- **"I'd like to take [a first-aid course next month]."** — A plan
- **"Which day next week is best for me to take off?"** — Should use your shifts and your constraints together

## Track C: Growing into leadership

For someone working towards more responsibility. Attie should collect your wins along the way and turn them into review material when you need it.

### Day 1 · Introduce yourself

_Thu 2 Oct_

- **"I like [detailed answers with an example]."** — A preference: changes every reply from now on
- **"My goal is to [become a team lead within two years]."** — A goal
- **"Right now I'm working on [my public speaking]."** — Current focus
- **"What does my HR profile say about my role?"** — Live HR data: your title comes from HR, not from memory

> Look for: "I'll remember that" changing from saving… to saved. 📸 the memory panel at the end.

### Day 2 · See if it remembers

_Fri 3 Oct · start a new chat_

- **"How can I start building leadership experience?"** — Should use your goal and focus, in detail
- **"This week I [mentored a new intern through onboarding]."** — A win
- **"I prefer feedback [in writing, so I can come back to it]."** — A preference
- **"I already know how the appraisal process works here."** — Something you already know

> Look for: advice built around your goal. Click See answer without memory under it. 📸 both answers.

### Day 3 · More wins, and a plan

_Sat 4 – Mon 6 Oct · start a new chat_

- **"I [led our weekly team meeting] for the first time."** — A win
- **"I'm planning to [attend a leadership workshop in November]."** — A plan
- **"Please draft leave for [13–14 November] for the workshop."** — A draft Attie will follow up on
- **"I want to improve at [giving feedback to colleagues]."** — Current focus

### Day 4 · The follow-up

_Next day · start a new chat_

- **"How was my attendance this month?"** — Any first question works

> Look for: Attie asking whether you submitted the November leave request. 📸 this, then answer honestly.

- **"I [automated our monthly report and saved the team a day of work]."** — Another win
- **"I'm reading [a book on managing people]."** — Current focus

### Day 5 · The payoff

_Tue 7 Oct · start a new chat_

- **"I also [presented our quarterly results to the department]."** — A win
- **"Help me prepare for my performance review."** — Should turn the wins you mentioned this week into review points

> Look for: your own wins from earlier days, connected to your goal. Click See answer without memory to compare. 📸 both. This is the most important one.

## For everyone

### Day 6 · Wrap-up, for everyone

_Wed 8 Oct · start a new chat_

- **"What do you remember about me?"** — A summary of everything from the week
- **"Actually, I now prefer [more detailed answers]."** — A correction: the old preference should stop being used
- **"Help me plan my next two weeks."** — Should pull together your goals, plans and focus

> In the memory panel: correct one memory with the pencil icon, and forget one you don't need with the bin icon. 📸 the panel before and after.

By now Attie should hold 10 or more memories about you. The count is shown at the top of the memory panel.

## What to send back

1. Your screenshots, labelled with the day.
2. One or two sentences on a moment where Attie remembering something actually helped, or where it got something wrong.
3. Anything that broke, looked odd or was slow, with the time it happened.

Your conversations stay private. The team only sees counts (how many messages and memories), never what you wrote.
