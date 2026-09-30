import OpenAI from "openai";
import { z } from "zod";

const MAX_TOOL_ROUNDS = 5;

/**
 * The model behind Atty. Talks to any OpenAI-compatible chat API —
 * DeepSeek by default, or Groq (see src/config.js). Two operations:
 *   chatWithTools — a reply, letting the model call the HR tools it needs
 *   json          — a structured answer validated against a Zod schema
 */
export function createLlm({ apiKey, baseUrl, model, extractModel }) {
  const client = new OpenAI({ apiKey: apiKey || "missing", baseURL: baseUrl, maxRetries: 3 });
  // gpt-oss models reason before answering; keep that short for chat latency and token budget.
  const tuning = (m) => (m.includes("gpt-oss") ? { reasoning_effort: "low" } : {});

  function requireKey() {
    if (!apiKey) throw new Error("no model API key configured (set DEEPSEEK_API_KEY in .env)");
  }

  async function complete(params) {
    try {
      return await client.chat.completions.create(params);
    } catch (err) {
      // Groq returns 400 tool_use_failed when the model emits a malformed tool call; one retry usually clears it.
      if (err instanceof OpenAI.BadRequestError && params.tools) {
        return await client.chat.completions.create(params);
      }
      throw err;
    }
  }

  return {
    /**
     * @param {object} p
     * @param {string} p.system
     * @param {{ role: "user" | "assistant", content: string }[]} p.messages
     * @param {{ name: string, description: string, schema: z.ZodType, run: (input: object) => Promise<object> }[]} p.tools
     * @returns {Promise<string>} the assistant's reply text
     */
    async chatWithTools({ system, messages, tools }) {
      requireKey();
      const byName = new Map(tools.map((t) => [t.name, t]));
      const toolDefs = tools.map((t) => {
        const { $schema, ...parameters } = z.toJSONSchema(t.schema);
        return { type: "function", function: { name: t.name, description: t.description, parameters } };
      });
      const convo = [{ role: "system", content: system }, ...messages];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const res = await complete({ model, messages: convo, tools: toolDefs, ...tuning(model) });
        const message = res.choices[0].message;
        if (!message.tool_calls?.length) return (message.content ?? "").trim();

        convo.push({ role: "assistant", content: message.content ?? "", tool_calls: message.tool_calls });
        const results = await Promise.all(
          message.tool_calls.map(async (call) => {
            const tool = byName.get(call.function.name);
            let content;
            if (!tool) {
              content = { error: `Unknown tool "${call.function.name}".` };
            } else {
              let args;
              try {
                args = JSON.parse(call.function.arguments || "{}");
              } catch {
                args = undefined;
              }
              const parsed = tool.schema.safeParse(args ?? {});
              content = parsed.success
                ? await tool.run(parsed.data)
                : { error: `Invalid arguments: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
            }
            return { role: "tool", tool_call_id: call.id, content: JSON.stringify(content) };
          }),
        );
        convo.push(...results);
      }

      // Out of tool rounds: ask for an answer from what has been gathered.
      const res = await complete({ model, messages: convo, ...tuning(model) });
      return (res.choices[0].message.content ?? "").trim();
    },

    /** @returns {Promise<object | null>} parsed output, or null if the model's JSON did not fit the schema */
    async json({ system, user, schema }) {
      requireKey();
      const { $schema, ...jsonSchema } = z.toJSONSchema(schema);
      const res = await complete({
        model: extractModel,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `${system}\n\nReply with a single JSON object matching this JSON Schema, and nothing else:\n${JSON.stringify(jsonSchema)}`,
          },
          { role: "user", content: user },
        ],
        ...tuning(extractModel),
      });
      try {
        const parsed = schema.safeParse(JSON.parse(res.choices[0].message.content ?? ""));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
  };
}
