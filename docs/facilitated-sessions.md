# Facilitated sessions

No independent testers were available, so the builder ran these sessions on three real staff
accounts in our company (with the account holders signed in), following the scripts below. They
show the memory working across days and across users. They are not independent real-world use,
and the article says so.

- Day 1 (1–2 Oct 2026): the three scenarios in [tester-guide.md](tester-guide.md). 8 memories kept.
- Day 2 (3 Oct 2026): below. Goal: about 3–4 new memories per account, plus checks that day-1
  memories come back without being asked.

Rules: one message at a time, no "remember this", no leading questions, record what Attie actually
does, including failures.

## Day 2

### Account 1 (tech-lead goal, short answers)

1. "Morning. Anything I should know before my shift today?" *Check: short answer (preference).*
2. "Quick correction: I'm not learning Go anymore, I'm back on Next.js. I'm building a small internal dashboard with it this month." *Check: Go memory replaced, not duplicated.*
3. "I already know how to request leave and check my payslip, so you don't need to walk me through those."
4. "I shipped the dashboard login page yesterday."
5. New chat: "What should I bring up in my 1:1 with my manager this week?" *Check: uses the win, the goal and the Next.js work.*

### Account 2 ("Kanis", December leave draft)

1. New chat: "What's my next shift?" *Check: follows up on the unsubmitted December leave without being asked.*
2. "Not yet, I'll submit it on Friday after I confirm with my team."
3. "I prefer bullet points over long paragraphs."
4. "I'm trying to get better at Excel pivot tables for the monthly reports. My goal this year is to lead the reporting team."
5. New chat: "What should I focus on this week?" *Check: bullets, pivot tables, the reporting-team goal, the Friday leave plan.*

### Account 3 (two wins: payroll export, intern)

1. "How's my attendance looking this month?" *Check: live HR data, no memory of other accounts.*
2. "Keep answers short, I mostly read these on my phone."
3. "I'm aiming to become a payroll specialist by next year. This week I'm documenting the payroll export process for the team."
4. "I already know how the payroll export works, I built it."
5. New chat: "I have a 1:1 with my manager tomorrow. What should I bring up?" *Check: short, uses both wins, the goal and this week's documentation work.*

## Results

| Day | Account | Memories added | Recalled unprompted | Notes |
|---|---|---|---|---|
| 1 | 1 | 3 | goal + focus in new chat (after fix e5e6ad8) | |
| 1 | 2 | 3 | December leave follow-up | "anything still to do" missed it, fixed in 8aefe1b |
| 1 | 3 | 2 | both wins for review prep | |
| 2 | 1 | +7 → **10** (Next.js correction replaced Go, code-example preference, request leave / payslip / clock-in how-tos, login-page win, mid-November plan, The Manager's Path) | short answers on day 2; after fix 9f0fc70 the 1:1 answer used the goal, the win and the book | ❌ before 9f0fc70, "1:1 with my manager" recalled nothing and asked for goals; "knows how to check my payslip" was blocked by the pay filter; Attie offered to "keep track of wins" it already keeps. All three fixed. Leave balance works after the backend fix (20 Official). Evidence: attie-day2-one-on-one.gif |
| 2 | 2 | +7 → **10** (submit-on-Friday plan, bullet-point preference, pivot-table focus, reporting-team goal, September report win, exemption how-to, Excel course plan) | December leave follow-up again on a new day; "focus this week" used bullets, pivot tables and the goal (without memory: "I can't pull up your goals… tell me what you're working toward") | ❌ after "I'll submit it Friday" Attie still asked twice whether it was submitted, and offered to "note any wins". Fixed in 88b0001 and 2b921c0 (plans now come with open threads; a stronger never-offer-to-track rule). Evidence: attie-day2-followup.gif, attie-day2-focus.gif |
| 2 | 3 | +8 → **10** (short-answers preference, numbered-checklist preference, payroll-specialist goal, payroll-docs focus, PAYE study, payslip how-to, zero-correction September win, end-of-October days off) | the goal was linked to the day-1 payroll-export win straight away; the new-chat 1:1 answer was a numbered list using all three wins, the goal, the docs work and the PAYE study (without memory: "Since I don't have your goals or recent context yet…") | Live HR attendance answer, no memories from other accounts. Minor: offered twice to draft the October days off. "Knows how the payroll export works" wasn't saved separately (covered by the win). Evidence: attie-day2-billiks-one-on-one.gif |
