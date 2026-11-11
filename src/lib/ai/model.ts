// One call to an OpenAI-compatible Chat Completions API that returns JSON.
// Callers validate the result in plain code. Default provider: Meta Model API.

export type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export const aiMode = (): "model" | "fallback" => (process.env.AI_API_KEY ? "model" : "fallback");

export function buildRequest(model: string, system: string, parts: Part[], schemaName: string, schema: Record<string, unknown>) {
  return {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: parts },
    ],
    response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
  };
}

// Reads the JSON object out of a Chat Completions response body.
export function parseCompletion(body: unknown): unknown {
  const choice = isObject(body) && Array.isArray(body.choices) ? body.choices[0] : undefined;
  if (!isObject(choice)) throw new Error("Model returned no choice");
  if (choice.finish_reason !== "stop") throw new Error(`Model stopped with ${String(choice.finish_reason)}`);
  const content = isObject(choice.message) ? choice.message.content : undefined;
  if (typeof content !== "string") throw new Error("Model returned no text");
  return JSON.parse(content);
}

// ponytail: in-memory counter, per process, resets on restart. Move it to the database if the app runs on more than one instance.
let calls = { day: "", count: 0 };

export async function askJson(system: string, parts: Part[], schemaName: string, schema: Record<string, unknown>): Promise<unknown> {
  const day = new Date().toISOString().slice(0, 10); // UTC day
  if (calls.day !== day) calls = { day, count: 0 };
  if (calls.count >= Number(process.env.AI_DAILY_CALLS || 300)) throw new Error("AI daily call limit reached");
  calls.count++;

  const baseUrl = process.env.AI_BASE_URL || "https://api.meta.ai/v1";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildRequest(process.env.AI_MODEL || "muse-spark-1.3", system, parts, schemaName, schema)),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Model API returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return parseCompletion(await res.json());
}

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });
