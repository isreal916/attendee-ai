#!/usr/bin/env node
/**
 * Attie memory impact report: how much each employee used Attie, what memory
 * did for them, and the totals across everyone. Reads counts only — the index
 * never holds conversation text.
 *
 *   npm run report:usage              print the report
 *   npm run report:usage -- --md      also write docs/impact-report.md
 *   npm run report:usage -- --all     include the demo company and test namespaces
 */
import { writeFileSync } from "node:fs";
import { config } from "../src/config.js";
import { openIndex } from "../src/memory/index-db.js";
import { openPgIndex } from "../src/memory/index-pg.js";

const all = process.argv.includes("--all");
const writeMd = process.argv.includes("--md");
const index = config.databaseUrl ? await openPgIndex(config.databaseUrl) : openIndex(config.dbPath);
const { events, statuses } = await index.usage();
await index.close();

const isReal = (ns) => /^attendee:/.test(ns) && !/^attendee:(demo|eval-|dbg-)/.test(ns);
const users = new Map();
const user = (ns) => {
  if (!users.has(ns)) users.set(ns, { events: {}, kept: {}, statuses: {}, days: 0, first: null, last: null });
  return users.get(ns);
};
for (const e of events) {
  if (!all && !isReal(e.ns)) continue;
  const u = user(e.ns);
  u.events[e.kind] = Number(e.total);
  if (e.kind === "turn") Object.assign(u, { days: Number(e.days), first: Number(e.first), last: Number(e.last) });
}
for (const s of statuses) {
  if (!all && !isReal(s.ns)) continue;
  const u = user(s.ns);
  u.statuses[s.status] = (u.statuses[s.status] ?? 0) + Number(s.n);
  if (s.status === "active" || s.status === "saving") u.kept[s.type] = (u.kept[s.type] ?? 0) + Number(s.n);
}

const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");
const rows = [...users.entries()].map(([ns, u], i) => {
  const ev = (k) => u.events[k] ?? 0;
  const st = (k) => u.statuses[k] ?? 0;
  return {
    employee: `Employee ${String.fromCharCode(65 + i)}`,
    ns,
    "days used": u.days,
    sessions: ev("session"),
    messages: ev("turn"),
    "memories created": ev("memories_saved"),
    "memories kept": st("active") + st("saving"),
    "memories recalled": ev("memories_recalled"),
    "personalised replies": ev("personalised_turn"),
    corrected: ev("memories_corrected") + ev("memories_edited"),
    forgotten: ev("memories_forgotten") + ev("memories_forgotten_in_chat"),
    "save failures": ev("save_failed"),
    "this helped": ev("helpful"),
    "compared without memory": ev("comparison_viewed"),
    from: day(u.first),
    to: day(u.last),
    _events: u.events,
    _kept: u.kept,
  };
});

const sum = (key) => rows.reduce((n, r) => n + (r[key] ?? 0), 0);
const sumEvent = (kind) => rows.reduce((n, r) => n + (r._events[kind] ?? 0), 0);
const allDays = rows.flatMap((r) => [r.from, r.to]).filter(Boolean).sort();
const BEHAVIOURS = [
  ["behaviour_preference_applied", "Replies shaped by a remembered preference"],
  ["behaviour_goal_or_focus_used", "Replies that used a goal or current focus"],
  ["behaviour_followup_raised", "Follow-ups on something unfinished"],
  ["behaviour_wins_used", "Replies that drew on remembered wins"],
  ["behaviour_known_howto", "How-tos not explained again"],
  ["behaviour_plan_used", "Replies that used a remembered plan"],
];
const TYPES = [
  ["preference", "Preferences"], ["goal", "Goals"], ["focus", "Current focus"], ["achievement", "Wins"],
  ["plan", "Plans"], ["open_thread", "Unfinished things"], ["knows", "Already known"], ["context", "Other"],
];
const keptByType = TYPES.map(([t, label]) => [label, rows.reduce((n, r) => n + (r._kept[t] ?? 0), 0)]).filter(([, n]) => n);

if (!rows.length) {
  console.log("No usage recorded yet.");
  process.exit(0);
}

const summary = {
  employees: rows.length,
  period: allDays.length ? `${allDays[0]} to ${allDays.at(-1)}` : "",
  sessions: sum("sessions"),
  messages: sum("messages"),
  "memories kept": sum("memories kept"),
  "memories recalled": sum("memories recalled"),
  "personalised replies": sum("personalised replies"),
  corrected: sum("corrected"),
  forgotten: sum("forgotten"),
  "save failures": sum("save failures"),
  "this helped": sum("this helped"),
};
const ready = rows.filter((r) => r["memories kept"] >= 10).length;

console.log("ATTIE MEMORY IMPACT\n");
console.table(summary);
console.log("What memory did:");
console.table(Object.fromEntries(BEHAVIOURS.map(([k, label]) => [label, sumEvent(k)])));
console.log("What employees chose to have remembered (kept now):");
console.table(Object.fromEntries(keptByType));
console.log("Per employee:");
console.table(rows.map(({ ns, _events, _kept, ...r }) => r));
console.log(`${rows.length} employee(s); ${ready} with 10+ memories kept.`);

if (writeMd) {
  const table = (head, body) =>
    [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");
  const perUser = rows.map(({ ns, _events, _kept, ...r }) => r);
  const md = [
    "# Attie memory impact",
    "",
    `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by \`npm run report:usage -- --md\`. Counts only: no conversation text is stored, so none appears here. Employees are anonymised.`,
    "",
    table(["", ""], Object.entries(summary).map(([k, v]) => [k, v])),
    "",
    "## What memory did",
    "",
    table(["Behaviour", "Times"], BEHAVIOURS.map(([k, label]) => [label, sumEvent(k)])),
    "",
    "## What employees chose to have remembered",
    "",
    table(["Kind", "Kept now"], keptByType),
    "",
    "## Per employee",
    "",
    table(Object.keys(perUser[0]), perUser.map((r) => Object.values(r))),
    "",
    `${ready} of ${rows.length} employees have 10 or more memories kept.`,
    "",
  ].join("\n");
  writeFileSync("docs/impact-report.md", md);
  console.log("Written to docs/impact-report.md");
}
