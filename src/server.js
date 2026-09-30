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

const store = new MemoryStore({
  client: memoryClient,
  index,
  maxDistance: config.recallMaxDistance,
  rememberTimeoutMs: config.rememberTimeoutMs,
});

const resumed = await store.resumeUploads();
if (resumed) console.log(`Resuming ${resumed} memory upload(s) interrupted by the last shutdown.`);

const llm = createLlm(config.llm);
if (!config.llm.apiKey) console.warn("No DEEPSEEK_API_KEY set — chat will fail until it is added to .env.");

const app = createApp({
  adapter,
  store,
  corsOrigins: config.corsOrigins,
  runTurn: (turn) => runTurn({ llm, adapter, store, assistantName: config.assistantName, ...turn }),
});

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(
    `Attendee AI on http://localhost:${port} · HR: ${adapter.name} · memory: ${config.memoryBackend} · index: ${index.kind} · model: ${config.llm.provider} ${config.llm.model}`,
  );
});
