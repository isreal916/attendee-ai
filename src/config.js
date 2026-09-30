const env = process.env;

export const config = {
  port: Number(env.PORT || 8787),
  // What the assistant calls itself — keep in step with the frontend.
  assistantName: env.ASSISTANT_NAME || "Attie",
  corsOrigins: (env.CORS_ORIGINS || "http://localhost:3000").split(",").map((s) => s.trim()),

  // Model — any OpenAI-compatible chat API. DeepSeek by default; Groq if only GROQ_API_KEY is set.
  llm: env.DEEPSEEK_API_KEY || !env.GROQ_API_KEY
    ? {
        provider: "deepseek",
        apiKey: env.DEEPSEEK_API_KEY || env.LLM_API_KEY || "",
        baseUrl: env.LLM_BASE_URL || "https://api.deepseek.com",
        model: env.LLM_MODEL || "deepseek-v4-pro",
        // The memory step is a small classification job; the cheaper model handles it.
        extractModel: env.LLM_EXTRACT_MODEL || "deepseek-flash",
      }
    : {
        provider: "groq",
        apiKey: env.GROQ_API_KEY,
        baseUrl: env.LLM_BASE_URL || "https://api.groq.com/openai/v1",
        model: env.LLM_MODEL || "openai/gpt-oss-120b",
        extractModel: env.LLM_EXTRACT_MODEL || "openai/gpt-oss-20b",
      },

  // HR data source: "mock" (seeded demo company) or "attendeehrm"
  hrAdapter: env.HR_ADAPTER || "mock",
  attendeeApiUrl: env.ATTENDEE_API_URL || "",

  // Memory: "walrus" (MemWal relayer) or "mock" (in-process, for demos/tests)
  memoryBackend: env.MEMORY_BACKEND || (env.MEMWAL_PRIVATE_KEY ? "walrus" : "mock"),
  memwal: {
    key: env.MEMWAL_PRIVATE_KEY,
    accountId: env.MEMWAL_ACCOUNT_ID,
    serverUrl: env.MEMWAL_SERVER_URL || undefined,
  },
  // Spike on the staging relayer: relevant hits scored 0.48–0.60 cosine distance.
  recallMaxDistance: Number(env.RECALL_MAX_DISTANCE || 0.75),
  // Spike: saves took 26–38s normally, minutes under relayer load.
  rememberTimeoutMs: Number(env.REMEMBER_TIMEOUT_MS || 300_000),

  dbPath: env.DB_PATH || "data/attendee-ai.db",
};
