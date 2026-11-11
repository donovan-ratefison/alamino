import { test } from "node:test";
import assert from "node:assert/strict";
import { askJson, buildRequest, parseCompletion, usd } from "./model.ts";
import { captureDebts, SCHEMA as CAPTURE_SCHEMA } from "./capture.ts";
import { SCHEMA as RESOLVE_SCHEMA } from "./resolve.ts";
import { buildStatement, explainRound, SCHEMA as EXPLAIN_SCHEMA } from "./explain.ts";
import type { Round, Trader } from "../types.ts";

// No network: a stub replaces fetch and records each request body.
process.env.AI_API_KEY = "test-key";
const requests: Record<string, unknown>[] = [];
let reply: unknown = {};
globalThis.fetch = async (_url, init) => {
  requests.push(JSON.parse(String(init?.body)));
  return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply) } }] });
};

// Runs first so the counter starts at zero.
test("daily cap throws at the limit before any network call", async () => {
  process.env.AI_DAILY_CALLS = "1";
  try {
    await askJson("s", [], "x", {});
    const before = requests.length;
    await assert.rejects(askJson("s", [], "x", {}), /AI daily call limit reached/);
    assert.equal(requests.length, before);
  } finally {
    delete process.env.AI_DAILY_CALLS;
  }
});

test("request body: system message, user parts and a strict json schema", () => {
  const body = buildRequest("m", "sys", [{ type: "text", text: "hi" }], "debt_drafts", { type: "object" });
  assert.deepEqual(body, {
    model: "m",
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: [{ type: "text", text: "hi" }] },
    ],
    response_format: { type: "json_schema", json_schema: { name: "debt_drafts", strict: true, schema: { type: "object" } } },
  });
});

test("capture sends a photo as a data URL part", async () => {
  reply = { drafts: [] };
  const traders: Trader[] = [{ id: "hery", name: "Hery", business: "", aliases: [], paypalEmail: "" }];
  await captureDebts({ imageBase64: "AAAA", mediaType: "image/png", traders, speakerId: "hery" });
  const user = (requests.at(-1)!.messages as { content: unknown }[])[1];
  assert.deepEqual((user.content as unknown[])[0], { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } });
});

test("response parsing", () => {
  const body = (finish_reason: string, content: unknown) => ({ choices: [{ finish_reason, message: { content } }] });
  assert.deepEqual(parseCompletion(body("stop", '{"a":1}')), { a: 1 });
  assert.throws(() => parseCompletion(body("length", '{"a":1}')), /stopped with length/);
  assert.throws(() => parseCompletion(body("stop", "not json")), SyntaxError);
  assert.throws(() => parseCompletion(body("stop", null)), /no text/);
  assert.throws(() => parseCompletion({}), /no choice/);
});

// Strict mode: every object lists all its keys in `required` and sets additionalProperties to false.
function assertStrict(node: unknown, path: string): void {
  if (Array.isArray(node)) return node.forEach((n, i) => assertStrict(n, `${path}[${i}]`));
  if (typeof node !== "object" || node === null) return;
  const n = node as Record<string, unknown>;
  if (n.type === "object") {
    assert.equal(n.additionalProperties, false, `${path}: additionalProperties`);
    assert.deepEqual([...(n.required as string[])].sort(), Object.keys(n.properties as object).sort(), `${path}: required`);
  }
  for (const [k, v] of Object.entries(n)) assertStrict(v, `${path}.${k}`);
}

test("the three schemas follow the strict rules and have an object at the top", () => {
  for (const [name, schema] of Object.entries({ CAPTURE_SCHEMA, RESOLVE_SCHEMA, EXPLAIN_SCHEMA })) {
    assert.equal(schema.type, "object", name);
    assertStrict(schema, name);
  }
});

test("a statement with model text is cached: no second model call", async () => {
  const round: Round = {
    id: "cache-r1",
    status: "cleared",
    createdAt: "2026-11-11T00:00:00Z",
    debtsBefore: [],
    debtChanges: [],
    result: {
      cancellations: [],
      remaining: [],
      positions: [{ traderId: "hery", netCents: 0 }],
      payIns: [],
      payOuts: [],
      stats: { grossCents: 0, clearedByCirclesCents: 0, remainingCents: 0, cashMovedCents: 0, savedPct: 0 },
    },
    settlements: [],
  };
  reply = { summary: "You pay nothing.", reasons: [] };
  const before = requests.length;
  const first = await explainRound(round, "hery", [], []);
  assert.equal(first.summary, "You pay nothing.");
  assert.equal(requests.length, before + 1);
  assert.equal(await explainRound(round, "hery", [], []), first);
  assert.equal(requests.length, before + 1);

  // Template text (the model output is rejected) is not cached.
  reply = { summary: "You pay $5.", reasons: [] };
  await explainRound(round, "soa", [], []);
  await explainRound(round, "soa", [], []);
  assert.equal(requests.length, before + 3);
});

test("the plain statement (?text=plain) makes no model call and has the same numbers as the full one", async () => {
  const round: Round = {
    id: "plain-r1",
    status: "cleared",
    createdAt: "2026-11-11T00:00:00Z",
    debtsBefore: [],
    debtChanges: [{ debtId: "d1", beforeCents: 5000, afterCents: 2000 }],
    result: {
      cancellations: [{ path: ["hery", "rivo"], amountCents: 3000 }],
      remaining: [],
      positions: [{ traderId: "hery", netCents: -2000 }],
      payIns: [],
      payOuts: [],
      stats: { grossCents: 0, clearedByCirclesCents: 0, remainingCents: 0, cashMovedCents: 0, savedPct: 0 },
    },
    settlements: [],
  };
  const debts = [
    { id: "d1", debtorId: "hery", creditorId: "rivo", amountCents: 5000, remainingCents: 2000, note: "", source: "seed" as const, status: "confirmed" as const, debtorOk: true, creditorOk: true, createdAt: "" },
  ];
  const before = requests.length;
  const plain = buildStatement(round, "hery", debts, []);
  assert.equal(requests.length, before);
  assert.match(plain.summary, /You pay \$20 into/);

  reply = { summary: "You pay $20.", reasons: [{ debtId: "d1", reason: "A circle cancelled $30." }] };
  const full = await explainRound(round, "hery", debts, []);
  assert.equal(requests.length, before + 1);
  assert.equal(full.summary, "You pay $20.");
  const numbers = (s: typeof plain) => [s.roundId, s.netCents, s.action, s.lines.map((l) => [l.debtId, l.direction, l.beforeCents, l.afterCents])];
  assert.deepEqual(numbers(full), numbers(plain));
});

test("usd: whole dollars without cents, two decimals otherwise", () => {
  assert.deepEqual([usd(8000), usd(1250), usd(5), usd(120000)], ["$80", "$12.50", "$0.05", "$1,200"]);
});
