// One Claude call that returns JSON. Callers validate the result in plain code.
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-opus-5-5";

export const aiMode = (): "model" | "fallback" => (process.env.AI_API_KEY ? "model" : "fallback");

let client: Anthropic | undefined;

export async function askJson(
  system: string,
  content: Anthropic.Beta.BetaContentBlockParam[],
  schema: Record<string, unknown>,
): Promise<unknown> {
  client ??= new Anthropic({ apiKey: process.env.AI_API_KEY });
  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  const res = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema } },
    // On a safety refusal the API retries on a fallback model. Only sent for the default model.
    ...(model === DEFAULT_MODEL && { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
  });
  if (res.stop_reason !== "end_turn") throw new Error(`Model stopped with ${res.stop_reason}`);
  const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").at(-1);
  if (!text) throw new Error("Model returned no text");
  return JSON.parse(text.text);
}

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });
