#!/usr/bin/env node
/**
 * Terminal chat against a running Attendee AI service — for trying it without
 * the AttendeeHRM frontend.
 *
 *   npm start                      (in one terminal)
 *   npm run chat -- demo-ada       (in another; or demo-tunde, demo-ngozi)
 *
 * Commands: /memories · /forget <number> · /memory on|off · /new · /quit
 */
import readline from "node:readline/promises";

const token = process.argv[2] || "demo-ada";
const base = process.env.ATTENDEE_AI_URL || `http://localhost:${process.env.PORT || 8787}`;

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

let messages = [];
let memory = true;
let listed = [];

const me = await api("/me").catch((err) => {
  console.error(`Could not reach ${base} as "${token}": ${err.message}`);
  process.exit(1);
});
console.log(`Signed in as ${me.name} (${me.company}). Memory is on. /memories, /memory off, /new, /quit\n`);

while (true) {
  const input = (await rl.question("you › ")).trim();
  if (!input) continue;
  try {
    if (input === "/quit") break;
    if (input === "/new") {
      messages = [];
      console.log(dim("— new conversation —\n"));
    } else if (input.startsWith("/memory ")) {
      memory = input.endsWith("on");
      console.log(dim(`memory ${memory ? "on" : "off"}\n`));
    } else if (input === "/memories") {
      listed = (await api("/memories")).memories;
      if (!listed.length) console.log(dim("Atty remembers nothing yet.\n"));
      listed.forEach((m, i) => console.log(dim(`${i + 1}. [${m.type}] ${m.text}${m.status === "saving" ? " (saving…)" : ""}`)));
      console.log();
    } else if (input.startsWith("/forget ")) {
      const target = listed[Number(input.split(" ")[1]) - 1];
      if (!target) console.log(dim("Run /memories first, then /forget <number>.\n"));
      else {
        await api(`/memories/${encodeURIComponent(target.id)}`, { method: "DELETE" });
        console.log(dim(`forgot: ${target.text}\n`));
      }
    } else {
      messages.push({ role: "user", content: input });
      const r = await api("/chat", { method: "POST", body: { messages, memory } });
      messages.push({ role: "assistant", content: r.reply });
      console.log(`\natty › ${r.reply}\n`);
      const notes = [];
      if (r.memory?.recalled?.length) notes.push(`recalled ${r.memory.recalled.length} memories`);
      if (r.hr?.lookups?.length) notes.push(`live HR: ${r.hr.lookups.map((t) => t.name).join(", ")}`);
      if (notes.length) console.log(dim(notes.join(" · ")));
      for (const e of r.memory?.events ?? []) {
        console.log(dim(e.event === "saved" ? `＋ will remember: [${e.memory.type}] ${e.memory.text}` : "－ forgot a memory"));
      }
      for (const a of r.hr?.actions ?? []) console.log(dim(`form to review: ${JSON.stringify(a)}`));
      if (notes.length || r.memory?.events?.length || r.hr?.actions?.length) console.log();
    }
  } catch (err) {
    console.log(dim(`error: ${err.message}\n`));
  }
}
rl.close();
