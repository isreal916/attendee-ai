#!/usr/bin/env node
/**
 * Repro: MemWalMock differs from the real MemWal client in ways that matter to tests.
 *   node scripts/repro/mock-parity.mjs      (no credentials needed)
 */
import { MemWal, MemWalMock } from "@mysten-incubation/memwal";

const mock = MemWalMock.create({ namespace: "demo" });
await mock.rememberAndWait("Works on the frontend team.");
await new Promise((r) => setTimeout(r, 20));
await mock.rememberAndWait("Moved from the frontend team to the backend team.");

const recent = await mock.recall({ query: "Which team?", limit: 2, sort: "recent" });
console.log('1. sort: "recent" on the mock returns, in order:');
for (const r of recent.results) console.log("   -", r.text, "| created_at:", r.created_at ?? "(missing)");

console.log("2. per-memory forget:");
console.log("   MemWalMock.prototype.forget:", typeof MemWalMock.prototype.forget);
console.log("   MemWal.prototype.forget:    ", typeof MemWal.prototype.forget);
