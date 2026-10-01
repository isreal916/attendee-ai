# Walrus Memory: reports from building Attendee AI

Five reports, each written to be pasted as a separate issue at
https://github.com/MystenLabs/MemWal/issues.

**Environment for all four**

- `@mysten-incubation/memwal` 0.1.8 (TypeScript SDK, default `MemWal` client)
- Node.js v24.13.1, Windows 11 Pro 10.0.22621
- Managed staging relayer `https://relayer-staging.memory.walrus.xyz`, `relayerVersion` 0.1.0, `apiVersion` 1.0.0
  (build `41c47d4` on 29 Sep 2026, `ded7e5a` on 30 Sep 2026)
- App model: DeepSeek `deepseek-v4-pro` via its OpenAI-compatible API (the model does not touch the SDK)

---

## 1. Docs list a testnet package ID that the staging relayer does not use

**Type:** documentation bug. Reproducible.

**Steps**

1. Open https://docs.wal.app/walrus-memory/contract/overview and read the Testnet package ID:
   `0xcf6ad755a1cdff7217865c796778fabe5aa399cb0cf2eba986f4b582047229c6`
2. Ask the staging relayer which package it uses:
   ```bash
   curl https://relayer-staging.memory.walrus.xyz/config
   ```
   → `"packageId":"0x0a625e2db2af6f591a4c80a3d8551ddf11656089cc3a20c5e9e7f8fb75b9265c","network":"testnet"`
3. Create an account at https://staging.memory.walrus.xyz and look up the account object on Sui testnet. Its type is
   `0x0a625e2d…9265c::account::MemWalAccount`.

**Expected:** the documented testnet package ID is the one the staging dashboard and relayer use.

**Actual:** both packages exist on testnet as separate version-1 packages with an `account` module. The docs name `0xcf6a…`; the dashboard and relayer use `0x0a62…`.

**Why it matters:** when the first `remember` failed with a bare 404, the package ID was the first thing we checked, and the mismatch sent the investigation in the wrong direction. Anyone building against the contract directly (or self-hosting a relayer from the docs) would target a package the managed staging stack does not read.

**Suggestion:** update the page, or point it at `GET /config` as the source of truth for the package a given relayer uses.

---

## 2. No way to forget a single memory from the SDK (the mock has one, the real client does not)

**Type:** missing capability / API parity gap. Reproducible.

**Steps**

```js
import { MemWal, MemWalMock } from "@mysten-incubation/memwal";
console.log(typeof MemWalMock.prototype.forget); // "function"  → forget(blobId)
console.log(typeof MemWal.prototype.forget);     // "undefined"
```

(`scripts/repro/mock-parity.mjs` in this repo.)

**Expected:** a delegate-key client can stop one memory from being recalled, given its `blob_id`.

**Actual**

- `MemWal` has no forget or delete method at all.
- The documented `POST /api/forget` works on a whole namespace and is not wrapped by the SDK.
- Permanent deletion (the security-delete flow) can target blob IDs but needs the **owner wallet** to sign, so a server holding only a delegate key cannot use it.
- `MemWalMock` does expose `forget(blobId)`, so code written and tested against the mock cannot run against the real client.

**Why it matters:** any chatbot with a "forget this" button needs it, and for us (HR software) it is a privacy requirement: "Undo" on a just-saved memory, and corrections ("I prefer detailed answers now") that should replace an older fact.

**What we did instead:** keep a local SQLite table of tombstoned `blob_id`s and filter every `recall()` result against it. It works, but the index becomes a second source of truth: lose it and forgotten memories come back.

**Suggestion:** a delegate-callable `forget({ blobIds, namespace })` that removes the vector rows for specific blobs (the same effect `/api/forget` has for a namespace), leaving permanent blob deletion to the owner flow. Failing that, remove `forget` from `MemWalMock` or mark it mock-only in the types.

---

## 3. `rememberAndWait` times out with status 504 while the job goes on to succeed; first failure was an opaque 404

**Type:** reliability / developer-experience friction. Seen repeatedly on 29 Sep 2026 (roughly 20:20–20:50 UTC); not reproducible on demand once the relayer recovered.

**What happened, in order, with the same account and key**

| Call | Result |
|---|---|
| `remember()` + `waitForRememberJob()` (default 60 s timeout), first call after account creation | `Walrus Memory server error (404): <no message>` |
| Same call a few minutes later | succeeded in 17.5 s |
| `rememberAndWait()`, default timeout | `remember job timed out after 60000ms (job_id=ab145a11-4b5e-459d-9f38-770fcddbef95)`, `status: 504` |
| `getRememberStatus()` right after | `fetch failed` — connect timeout to the relayer |
| `GET /health` during this | HTTP 200 `{"status":"ok"}`, but taking 17 s to answer |
| `rememberAndWait()` with `timeoutMs: 180000` | `remember job timed out after 180000ms (job_id=d9d6bd98-bffc-4126-a590-b74fb62e02be)`, `status: 504` |
| Next morning | both "timed out" jobs report `status: "done"`; normal saves take 26–39 s |

**Expected**

- A wait that gives up is distinguishable from a server failure.
- An error from `/api/remember` says what was not found.
- Typical save latency is documented, so callers can choose a timeout.

**Actual**

- The client-side wait timeout is raised with `status: 504`, the same shape as a gateway error, although the job is still healthy and later completes. A caller that retries on 5xx will store the memory twice unless it thought to pass an `idempotencyKey`.
- The 404 carried no body (`<no message>`), so there was no way to tell a missing account, a missing route and an overloaded relayer apart.
- Normal end-to-end save time on staging is 26–39 s (accept ≈ 4 s, `uploaded` at ≈ 32 s, `done` at ≈ 39 s). The default 60 s wait leaves little headroom, and the docs do not mention latency at all.

**Suggestions**

1. Raise a distinct error for a wait that gave up (for example `MemWalRememberTimeoutError` with `jobId`), without an HTTP-style `status`.
2. Keep a short machine-readable code in sanitised error bodies (`account_not_found`, `route_not_found`, `overloaded`).
3. State typical save latency in the SDK docs, and recommend the pattern "acknowledge to the user, upload in the background".
4. Consider making `/health` reflect queue or upstream health, not only process liveness.

---

## 4. `MemWalMock` ignores `sort: "recent"` and omits `created_at`

**Type:** mock fidelity bug. Reproducible, no credentials needed.

**Steps**

```js
import { MemWalMock } from "@mysten-incubation/memwal";

const mock = MemWalMock.create({ namespace: "demo" });
await mock.rememberAndWait("Works on the frontend team.");
await new Promise((r) => setTimeout(r, 20));
await mock.rememberAndWait("Moved from the frontend team to the backend team.");

const { results } = await mock.recall({ query: "Which team?", limit: 2, sort: "recent" });
console.log(results.map((r) => [r.text, r.created_at]));
```

**Expected:** newest first, each result carrying `created_at`, as the real relayer does.

**Actual**

```
[ "Works on the frontend team.", undefined ]
[ "Moved from the frontend team to the backend team.", undefined ]
```

Oldest first, and `created_at` is missing. Against the staging relayer an equivalent pair comes back newest first with `created_at` set (`scripts/memory-spike.mjs`, check "correction wins").

**Why it matters:** "newest wins" is exactly the behaviour worth unit-testing for corrections, and it is the one the mock cannot show. Our correction test failed on the mock and passed on the relayer, which cost time working out which side was wrong. Code that reads `created_at` for expiry also behaves differently in tests.

**Suggestion:** record a write time in the mock, return it as `created_at`, and honour `sort: "recent"`.

---

## 5. A required peer dependency is only discovered at the first recall, in production

**Type:** packaging / developer-experience friction. Reproducible.

**Steps**

1. Install the SDK in a project, with an installer that does not add peer dependencies automatically (Yarn classic, `npm --legacy-peer-deps`, or a host's default build command).
2. `MemWal.create(...)` and start the server: no error.
3. Call `recall()` (or let a `remember()` job run).

**Actual:** `Cannot find package '@mysten/seal' imported from …/memwal/dist/memwal.js`. The default relayer client imports `@mysten/seal` and `@mysten/sui` lazily (`await import("@mysten/seal")` inside the session setup), so nothing fails at install or start-up. In our deployment every recall and every save failed from the first employee message, and the app could only report "memory unavailable" until we added a health check that ran one real recall.

**Expected:** either the packages the default client always needs are regular dependencies, or `MemWal.create()` checks for them and fails immediately with a clear message.

**Note:** both are listed as non-optional `peerDependencies` in 0.1.8, so npm 7+ installs them; the README's install line (`npm install @mysten-incubation/memwal`) does not mention them for the default `MemWal` client (it does for `MemWalManual`).

---

## Checked and dropped

Two things looked like bugs during the build and turned out not to be. Listed so nobody re-reports them from our notes:

- **"A memory is searchable before its job is done."** A direct test (`scripts/repro/recall-before-done.mjs`) shows recall returns the memory at the same moment the job reports `done`. What we saw was our own client learning about `done` late, because `waitForRememberJob` polls with backoff.
- **"`created_at` is sometimes missing from recall results."** Seen once on 29 Sep against build `41c47d4`; always present on 30 Sep against build `ded7e5a`. Most likely fixed by that deploy.
