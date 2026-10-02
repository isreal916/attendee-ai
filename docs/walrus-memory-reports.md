# Walrus Memory: issues found while building Attendee AI

Six issues, each ready to paste as its own GitHub issue at
https://github.com/MystenLabs/MemWal/issues. Each one has a title, an environment block, steps
to reproduce, expected vs actual behaviour, and the workaround we used, as the Session 8 bug
bounty asks. Copy from the **Title** line down to the next horizontal rule.

Filed: [ ] 1 [ ] 2 [ ] 3 [ ] 4 [ ] 5 [ ] 6. Add the issue URLs here once posted.

---

## Issue 1

**Title:** Docs list a testnet package ID that the staging relayer and dashboard don't use

**Type:** Documentation bug (reproducible)

**Environment**
- SDK: `@mysten-incubation/memwal` 0.1.8 (TypeScript, default `MemWal` client)
- Runtime: Node.js v24.13.1
- OS: Windows 11 Pro 10.0.22621
- Relayer: managed staging `https://relayer-staging.memory.walrus.xyz` (`relayerVersion` 0.1.0, `apiVersion` 1.0.0)
- Model: DeepSeek `deepseek-v4-pro` via its OpenAI-compatible API (the model never touches the SDK)

**Steps to reproduce**
1. Open https://docs.wal.app/walrus-memory/contract/overview and note the testnet package ID:
   `0xcf6ad755a1cdff7217865c796778fabe5aa399cb0cf2eba986f4b582047229c6`
2. Ask the staging relayer which package it uses:
   ```bash
   curl https://relayer-staging.memory.walrus.xyz/config
   ```
   Result: `"packageId":"0x0a625e2db2af6f591a4c80a3d8551ddf11656089cc3a20c5e9e7f8fb75b9265c","network":"testnet"`
3. Create an account at https://staging.memory.walrus.xyz and look up the account object on Sui testnet. Its type is
   `0x0a625e2d…9265c::account::MemWalAccount`.

**Expected:** the documented testnet package ID is the one the staging dashboard and relayer use.

**Actual:** two separate version-1 packages with an `account` module exist on testnet. The docs name `0xcf6a…`, while the dashboard and relayer use `0x0a62…`.

**Impact:** when our first `remember` failed with a bare 404 (see issue 3), the package ID was the first thing we checked, and the mismatch sent us the wrong way. Anyone building against the contract directly, or self-hosting a relayer from the docs, would target a package the managed staging stack doesn't read.

**Suggestion:** update the page, or point readers to `GET /config` as the source of truth for the package a given relayer uses.

---

## Issue 2

**Title:** No way to forget a single memory from the SDK (`MemWalMock.forget` exists, `MemWal.forget` doesn't)

**Type:** Missing capability / API parity gap (reproducible, no credentials needed)

**Environment**
- SDK: `@mysten-incubation/memwal` 0.1.8 (TypeScript, default `MemWal` client and `MemWalMock`)
- Runtime: Node.js v24.13.1
- OS: Windows 11 Pro 10.0.22621
- Relayer: managed staging `https://relayer-staging.memory.walrus.xyz`
- Model: DeepSeek `deepseek-v4-pro` (not involved)

**Steps to reproduce**
```js
import { MemWal, MemWalMock } from "@mysten-incubation/memwal";
console.log(typeof MemWalMock.prototype.forget); // "function"  → forget(blobId)
console.log(typeof MemWal.prototype.forget);     // "undefined"
```
Also at `scripts/repro/mock-parity.mjs` in https://github.com/isreal916/attendee-ai.

**Expected:** a client holding a delegate key can stop one memory from being recalled, given its `blob_id`.

**Actual**
- `MemWal` has no forget or delete method.
- The documented `POST /api/forget` works on a whole namespace, and the SDK doesn't wrap it.
- Permanent deletion (the security-delete flow) can target blob IDs but needs the **owner wallet** to sign, so a server holding only a delegate key can't use it.
- `MemWalMock` does have `forget(blobId)`, so code written and tested against the mock can't run against the real client.

**Impact:** any chatbot with a "forget this" button needs this. For us (HR software) it's a privacy requirement: "Undo" on a just-saved memory, and corrections ("I prefer detailed answers now") that should replace an older fact.

**Workaround:** a local table of tombstoned `blob_id`s that filters every `recall()` result. It works, but the index becomes a second source of truth: lose it and forgotten memories come back.

**Suggestion:** a delegate-callable `forget({ blobIds, namespace })` that removes the vector rows for specific blobs (what `/api/forget` already does for a whole namespace), leaving permanent blob deletion to the owner flow. Failing that, remove `forget` from `MemWalMock` or mark it mock-only in the types.

---

## Issue 3

**Title:** `rememberAndWait` reports a client-side wait timeout as `status: 504` while the job goes on to succeed; first failure was a 404 with no body

**Type:** Reliability / developer-experience friction (the 504 shape is reproducible from the source; the relayer slowness was seen on 29 Sep 2026, roughly 20:20–20:50 UTC)

**Environment**
- SDK: `@mysten-incubation/memwal` 0.1.8 (TypeScript, default `MemWal` client)
- Runtime: Node.js v24.13.1
- OS: Windows 11 Pro 10.0.22621
- Relayer: managed staging `https://relayer-staging.memory.walrus.xyz` (build `41c47d4` on 29 Sep 2026)
- Model: DeepSeek `deepseek-v4-pro` (not involved)

**Steps to reproduce**
1. Call `rememberAndWait(text, namespace)` with the default 60 s timeout (or any timeout shorter than the job takes).
2. When the wait gives up, inspect the error: `remember job timed out after 60000ms (job_id=…)` with `status: 504`. Thrown at `dist/memwal.js:397` in 0.1.8.
3. Call `getRememberStatus(jobId)` later: the job reports `status: "done"`.

What we saw, in order, with one account and key:

| Call | Result |
|---|---|
| `remember()` + `waitForRememberJob()`, first call after account creation | `Walrus Memory server error (404): <no message>` |
| Same call a few minutes later | succeeded in 17.5 s |
| `rememberAndWait()`, default timeout | `remember job timed out after 60000ms (job_id=ab145a11-4b5e-459d-9f38-770fcddbef95)`, `status: 504` |
| `getRememberStatus()` right after | `fetch failed` (connect timeout to the relayer) |
| `GET /health` meanwhile | HTTP 200 `{"status":"ok"}`, but 17 s to answer |
| `rememberAndWait()` with `timeoutMs: 180000` | `remember job timed out after 180000ms (job_id=d9d6bd98-bffc-4126-a590-b74fb62e02be)`, `status: 504` |
| Next morning | both "timed out" jobs report `status: "done"`; normal saves take 26–39 s |

**Expected**
- A wait that gives up is distinguishable from a server failure.
- An error from `/api/remember` says what wasn't found.
- Typical save latency is documented, so callers can choose a timeout.

**Actual**
- The client-side wait timeout carries `status: 504`, the same shape as a gateway error, though the job is healthy and later completes. A caller that retries on 5xx stores the memory twice unless it passed an `idempotencyKey`.
- The 404 had no body (`<no message>`), so a missing account, a missing route and an overloaded relayer look the same.
- Normal save time on staging is 26–39 s (accepted ≈ 4 s, `uploaded` ≈ 32 s, `done` ≈ 39 s; 29.4 s measured again on 1 Oct with `scripts/repro/idempotency.mjs`). The default 60 s wait leaves little headroom, and the docs don't mention latency.

**Workaround:** reply to the user at once, upload in the background with an `idempotencyKey`, show "saving…" until `done`, retry once, and resume unfinished uploads after a restart.

**Suggestions**
1. Raise a distinct error for a wait that gave up (e.g. `MemWalRememberTimeoutError` with `jobId`), without an HTTP-style `status`.
2. Keep a short machine-readable code in sanitised error bodies (`account_not_found`, `route_not_found`, `overloaded`).
3. State typical save latency in the SDK docs and recommend "acknowledge the user, upload in the background".
4. Consider making `/health` reflect queue or upstream health, not only that the process is alive.

---

## Issue 4

**Title:** `MemWalMock` ignores `sort: "recent"` and omits `created_at`

**Type:** Mock fidelity bug (reproducible, no credentials needed)

**Environment**
- SDK: `@mysten-incubation/memwal` 0.1.8 (`MemWalMock`)
- Runtime: Node.js v24.13.1
- OS: Windows 11 Pro 10.0.22621
- Compared against: managed staging relayer `https://relayer-staging.memory.walrus.xyz`
- Model: DeepSeek `deepseek-v4-pro` (not involved)

**Steps to reproduce**
```js
import { MemWalMock } from "@mysten-incubation/memwal";

const mock = MemWalMock.create({ namespace: "demo" });
await mock.rememberAndWait("Works on the frontend team.");
await new Promise((r) => setTimeout(r, 20));
await mock.rememberAndWait("Moved from the frontend team to the backend team.");

const { results } = await mock.recall({ query: "Which team?", limit: 2, sort: "recent" });
console.log(results.map((r) => [r.text, r.created_at]));
```

**Expected:** newest first, each result with `created_at`, as the real relayer returns.

**Actual**
```
[ "Works on the frontend team.", undefined ]
[ "Moved from the frontend team to the backend team.", undefined ]
```
Oldest first, with no `created_at`. Against the staging relayer the equivalent pair comes back newest first with `created_at` set (`scripts/memory-spike.mjs`, check "correction wins").

**Impact:** "newest wins" is exactly the behaviour worth unit-testing for corrections, and the mock can't show it. Our correction test failed on the mock and passed on the relayer, and working out which side was wrong cost time. Code that reads `created_at` for expiry also behaves differently in tests.

**Suggestion:** record a write time in the mock, return it as `created_at`, and honour `sort: "recent"`.

---

## Issue 5

**Title:** Missing `@mysten/seal` is only discovered at the first recall, in production, not at install or `MemWal.create()`

**Type:** Packaging / developer-experience friction (reproducible)

**Environment**
- SDK: `@mysten-incubation/memwal` 0.1.8 (TypeScript, default `MemWal` client)
- Runtime: Node.js v24.13.1 locally; Node.js on Render's free web service in production
- OS: Windows 11 Pro 10.0.22621 (local), Linux (Render)
- Relayer: managed staging `https://relayer-staging.memory.walrus.xyz`
- Model: DeepSeek `deepseek-v4-pro` (not involved)

**Steps to reproduce**
1. Install the SDK with an installer that doesn't add peer dependencies automatically (Yarn classic, `npm --legacy-peer-deps`, or some hosts' default build command).
2. Call `MemWal.create(...)` and start the server: no error.
3. Call `recall()`, or let a `remember()` job run.

**Expected:** either the packages the default client always needs are regular dependencies, or `MemWal.create()` checks for them and fails at once with a clear message.

**Actual:** `Cannot find package '@mysten/seal' imported from …/memwal/dist/memwal.js`. The default relayer client imports `@mysten/seal` and `@mysten/sui` lazily (`await import("@mysten/seal")` inside session setup), so nothing fails at install or start-up. In our deployment every recall and save failed from the first employee message, and the app could only say "memory unavailable" until we added a health check that runs one real recall.

**Workaround:** add `@mysten/seal` and `@mysten/sui` as direct dependencies, and run one real recall in a health check.

**Note:** both are listed as non-optional `peerDependencies` in 0.1.8, so npm 7+ installs them. The README's install line (`npm install @mysten-incubation/memwal`) doesn't mention them for the default `MemWal` client, though it does for `MemWalManual`.

---

## Issue 6

**Title:** `recall()` has a fixed 15 s timeout the caller can't change, and the first recall after a cold start takes 7–10 s

**Type:** Developer-experience friction (the fixed timeout is reproducible from the source; the cold-start timing was measured on the staging relayer)

**Environment**
- SDK: `@mysten-incubation/memwal` 0.1.8 (TypeScript, default `MemWal` client)
- Runtime: Node.js v24.13.1; production on Render's free web service, which sleeps when idle
- OS: Windows 11 Pro 10.0.22621 (local), Linux (Render)
- Relayer: managed staging `https://relayer-staging.memory.walrus.xyz`
- Model: DeepSeek `deepseek-v4-pro` (not involved)

**Steps to reproduce**
1. In 0.1.8, see `dist/memwal.js:84`: `const RECALL_REQUEST_TIMEOUT_MS = 15_000;`, passed as `{ timeoutMs: RECALL_REQUEST_TIMEOUT_MS }` at line 660. `recall()` options don't accept a timeout.
2. Start a fresh process, create the client, and time the first `recall()`.

**Expected:** the caller can set the recall timeout like the other calls (`waitForRememberJob`, bulk status), or the first recall's session setup can be done ahead of time by an explicit method.

**Actual:** in our runs the first recall after a start took 7–10 s (session setup plus the request). On a host that sleeps when idle, the first user message after a quiet spell spends half the fixed 15 s budget before the query runs, and a slow relayer moment then fails the recall with no way to allow more time.

**Workaround:** warm the client with a throwaway recall at start-up and every 9 minutes, retry a failed recall once, and fall back to the last good copy of the employee's memories.

**Suggestion:** accept `timeoutMs` in `recall()` options (defaulting to 15 s), and expose a `warmUp()`/`connect()` that does session setup ahead of the first query.

---

## Verified working

Credit where it's due, since our reports rely on these:

- **Idempotency keys work.** `remember(text, ns, { idempotencyKey })` sent twice with the same key returns the same job and blob, and recall finds one copy (`scripts/repro/idempotency.mjs`, 1 Oct 2026). This is what makes re-sending an upload after a timeout or restart safe, which matters given issue 3.
- **Namespaces isolate.** Two namespaces under one account never returned each other's memories in any of our runs (`scripts/memory-spike.mjs`, `npm run eval:behaviour`), nor across three real employees in the live app.
- **`sort: "recent"` works on the relayer** for "newest wins" corrections (see issue 4 for the mock).

## Checked and dropped

Two things looked like bugs during the build but weren't. Listed so nobody re-reports them from our notes:

- **"A memory is searchable before its job is done."** A direct test (`scripts/repro/recall-before-done.mjs`) shows recall returns the memory at the same moment the job reports `done`. What we saw was our own client learning about `done` late, because `waitForRememberJob` polls with backoff.
- **"`created_at` is sometimes missing from recall results."** Seen once on 29 Sep against build `41c47d4`; always present on 30 Sep against build `ded7e5a`. Probably fixed by that deploy.
