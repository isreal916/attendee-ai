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
| 2 | 1 | | | |
| 2 | 2 | | | |
| 2 | 3 | | | |
