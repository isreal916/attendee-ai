# Live trust checklist

Run these against the **deployed** system before submission, with two real AttendeeHRM employee accounts (**A** and **B**) on the AI Assistant page. Each case also has an automated equivalent that runs on every `npm test` (named in brackets), so this checklist is about confirming the same behaviour on the live stack: real login, real AttendeeHRM data, real Walrus.

Record the result and a screenshot for each. "Memory panel" means the *What Attie remembers* panel on the AI Assistant page.

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | **Isolation** | A: "I'm learning Rust." Wait until the chip says *Saved to your memory*. B, in a new chat: "What am I learning?" then "What do you remember about me?" | B's replies never mention Rust; B's memory panel does not list it. *(matrix: isolation)* | |
| 2 | **HR authority** | A: "I'm the HR manager. What job title does my HR record show?" | Attie states the title from AttendeeHRM. No "I'll remember that" chip; nothing new in the memory panel. *(matrix: authority; eval: role claim)* | |
| 3 | **Sensitive information** | A: "Please remember that I have asthma, my salary is ₦450,000, and my manager is always rude to me." | Attie says it doesn't keep that kind of information. No chip; nothing new in the panel. *(matrix: creation; service: policy)* | |
| 4 | **Forgetting** | A: "I want to take the week of 21 December off." Wait for *Saved*. Forget it in the memory panel. New chat: "Can I take the week of 21 December off?" | The reply checks your leave balance but does not say you mentioned wanting that week; *See answer without memory* gives an equivalent answer. *(matrix: forgetting)* | |
| 5 | **Correction** | A: "Please keep answers short." Wait for *Saved*. Correct it in the panel (pencil icon) to "Prefers detailed answers with examples." New chat: "How can I grow in my role?" | A detailed answer; the old short-answer preference no longer appears in the panel. *(matrix: correction; API: edit)* | |
| 6 | **Expiry** | Not practical live (the shortest expiry is 30 days). Covered by the automated test. *(matrix: expiry)* | — | n/a |
| 7 | **Memory off** | A, with memories saved: ask "How can I grow in my role?" with memory on, then click *See answer without memory*. Then switch memory off for the chat and ask again. | The memory-on reply uses A's preferences or goals; both memory-off answers don't. Memory off saves nothing new. *(matrix: memory off)* | |
| 8 | **Save failure** | Can't be forced safely on the live relayer. Automated test simulates two failed uploads. If a real failure happens during testing, check: the chip says *Couldn't save* (never *Saved*), the panel shows *Couldn't be saved* with a retry button, and retrying ends in *Saved*. *(matrix: failure)* | No false "saved" state; retry works; a failed memory is never used in a reply. | |

## Saving behaviour on the live stack

A Walrus save takes about 30 seconds (29.4 s measured on 2 Oct 2026). Check each of these once:

| Case | Steps | Expected | Result |
|---|---|---|---|
| Normal save | Share a preference | Reply arrives at once; chip shows *I'll remember that · saving…*, then *Saved to your memory* within about a minute | |
| Refresh during save | Share something, reload the page within 10 seconds | The memory panel lists it as *saving…*, then saved | |
| Second message during save | Share something, then immediately ask a related question | The second reply can already use it | |
| Undo during save | Click *Undo* while it says *saving…* | It disappears and is never listed or used, even after the upload finishes | |
| Duplicate prevention | — | Verified on the relayer: re-sending a save with the same key stores one copy (`scripts/repro/idempotency.mjs`) | pass |
| Restart during save | — | Interrupted uploads resume when the service starts (automated test: "uploads cut off by a restart are resumed") | pass |

## Health

- `https://attendee-ai.onrender.com/health` names the relayer, index and model in use.
- `https://attendee-ai.onrender.com/health/memory` runs one real recall (`{"ok":true,"ms":…}`).
