#!/usr/bin/env node
/**
 * Per-tester usage, for the hackathon evidence: how much each employee used
 * Attie and what memory did for them. Reads counts only — the index never
 * holds conversation text.
 *
 *   npm run report:usage            (real employees only)
 *   npm run report:usage -- --all   (include the demo company and test namespaces)
 */
import { config } from "../src/config.js";
import { openIndex } from "../src/memory/index-db.js";
import { openPgIndex } from "../src/memory/index-pg.js";

const all = process.argv.includes("--all");
const index = config.databaseUrl ? await openPgIndex(config.databaseUrl) : openIndex(config.dbPath);
const { events, statuses } = await index.usage();
await index.close();

const isReal = (ns) => /^attendee:/.test(ns) && !/^attendee:demo:/.test(ns);
const users = new Map();
const user = (ns) => {
  if (!users.has(ns)) users.set(ns, { events: {}, statuses: {}, days: 0, first: null, last: null });
  return users.get(ns);
};
for (const e of events) {
  if (!all && !isReal(e.ns)) continue;
  const u = user(e.ns);
  u.events[e.kind] = Number(e.total);
  if (e.kind === "turn") {
    u.days = Number(e.days);
    u.first = Number(e.first);
    u.last = Number(e.last);
  }
}
for (const s of statuses) {
  if (!all && !isReal(s.ns)) continue;
  user(s.ns).statuses[s.status] = Number(s.n);
}

const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");
const rows = [...users.entries()].map(([ns, u]) => {
  const ev = (k) => u.events[k] ?? 0;
  const st = (k) => u.statuses[k] ?? 0;
  return {
    employee: ns.replace(/^attendee:/, ""),
    "days used": u.days,
    sessions: ev("session"),
    messages: ev("turn"),
    "memories kept now": st("active") + st("saving"),
    "memories created": ev("memories_saved"),
    "memories recalled": ev("memories_recalled"),
    "personalised replies": ev("personalised_turn"),
    corrected: ev("memories_corrected") + ev("memories_edited"),
    forgotten: ev("memories_forgotten") + ev("memories_forgotten_in_chat"),
    "save failures": ev("save_failed"),
    "this helped": ev("helpful"),
    from: day(u.first),
    to: day(u.last),
  };
});

if (!rows.length) {
  console.log("No usage recorded yet.");
} else {
  console.table(rows);
  const ready = rows.filter((r) => r["memories kept now"] >= 10).length;
  console.log(`${rows.length} employee(s); ${ready} with 10+ memories kept.`);
}
