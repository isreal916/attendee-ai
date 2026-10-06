import { readFile } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { MemWal, MemWalMock } from "@mysten-incubation/memwal";
import { runTurn } from "./agent.js";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { getAdapter } from "./hr/index.js";
import { createLlm } from "./llm.js";
import { openIndex } from "./memory/index-db.js";
import { openPgIndex } from "./memory/index-pg.js";
import { MemoryStore } from "./memory/store.js";

const adapter = getAdapter(config.hrAdapter, config);

const memoryClient =
  config.memoryBackend === "walrus"
    ? MemWal.create({ key: config.memwal.key, accountId: config.memwal.accountId, serverUrl: config.memwal.serverUrl })
    : MemWalMock.create();

const index = config.databaseUrl ? await openPgIndex(config.databaseUrl) : openIndex(config.dbPath);

if (config.memoryBackend === "walrus" && !config.memwal.serverUrl) {
  console.warn("MEMWAL_SERVER_URL is not set: using the mainnet relayer. A testnet (staging) account will not work there.");
}

const store = new MemoryStore({
  client: memoryClient,
  index,
  maxDistance: config.recallMaxDistance,
  rememberTimeoutMs: config.rememberTimeoutMs,
});

// The relayer's first recall after a start sets up a session and can take 7–10s;
// do it now rather than on an employee's first message, and keep it warm.
store.warmUp().then((ms) => ms != null && console.log(`Memory relayer ready (${ms} ms).`));
setInterval(() => store.warmUp(), 9 * 60_000).unref();

const resumed = await store.resumeUploads();
if (resumed) console.log(`Resuming ${resumed} memory upload(s) interrupted by the last shutdown.`);

// The demo page names the Walrus network so its blob links open on the right explorer.
const network = /staging|testnet/.test(config.memwal.serverUrl ?? "") ? "testnet" : "mainnet";
const demoOn = config.demoEnabled || config.hrAdapter === "mock";
const demoPage = demoOn
  ? (await readFile(new URL("./demo.html", import.meta.url), "utf8")).replaceAll("__NETWORK__", network)
  : null;

const llm = createLlm(config.llm);
if (!config.llm.apiKey) console.warn("No DEEPSEEK_API_KEY set — chat will fail until it is added to .env.");

const app = createApp({
  adapter,
  store,
  corsOrigins: config.corsOrigins,
  status: {
    memory: config.memoryBackend,
    // Which relayer: an account only exists on one network, and the SDK silently defaults to mainnet.
    relayer: config.memoryBackend === "walrus" ? (config.memwal.serverUrl ?? "default (mainnet)") : null,
    index: index.kind,
    model: config.llm.apiKey ? `${config.llm.provider} ${config.llm.model}` : "no model key set",
    cors: config.corsOrigins,
    demo: demoOn ? "/demo" : null,
  },
  demoPage,
  checkMemory: () => store.checkRelayer(),
  runTurn: (turn) => runTurn({ llm, adapter, store, assistantName: config.assistantName, ...turn }),
});

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(
    `Attendee AI on http://localhost:${port} · HR: ${adapter.name} · memory: ${config.memoryBackend} · index: ${index.kind} · model: ${config.llm.provider} ${config.llm.model}`,
  );
});
