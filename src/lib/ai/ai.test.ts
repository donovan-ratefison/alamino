import { test } from "node:test";
import assert from "node:assert/strict";
import { captureDebts, fallbackCapture, validateDrafts } from "./capture.ts";
import { applyExplanation, buildStatement } from "./explain.ts";
import { validateResolution } from "./resolve.ts";
import type { Debt, Round, Trader } from "../types.ts";

delete process.env.AI_API_KEY; // the tests never call the model

const trader = (id: string, name: string, aliases: string[] = []): Trader => ({
  id,
  name,
  business: "",
  aliases,
  paypalEmail: `${id}@example.com`,
});
const traders = [
  trader("hery", "Hery", ["Rakoto"]),
  trader("soa", "Soa", ["the restaurant"]),
  trader("rivo", "Rivo"),
  trader("lalao", "Lalao"),
  trader("fidy", "Fidy"),
];
const input = (text: string, speakerId = "rivo") => ({ text, traders, speakerId });

test("fallback capture reads a third-party sentence", () => {
  const [d] = fallbackCapture(input("Soa owes Hery 300 for rice"));
  assert.equal(d.debtorId, "soa");
  assert.equal(d.creditorId, "hery");
  assert.equal(d.amountCents, 30000);
  assert.equal(d.note, "rice");
  assert.equal(d.question, undefined);
});

test("fallback capture maps I and me to the speaker", () => {
  const [a] = fallbackCapture(input("I owe Hery 50 for rice"));
  assert.deepEqual([a.debtorId, a.creditorId, a.amountCents], ["rivo", "hery", 5000]);
  const [b] = fallbackCapture(input("Hery owes me 120", "soa"));
  assert.deepEqual([b.debtorId, b.creditorId, b.amountCents, b.note], ["hery", "soa", 12000, ""]);
});

test("fallback capture matches aliases, cents and several sentences", () => {
  const drafts = fallbackCapture(input("the restaurant owes rakoto $12.50 for oil. Lalao owes Fidy 1,200"));
  assert.deepEqual(
    drafts.map((d) => [d.debtorId, d.creditorId, d.amountCents]),
    [
      ["soa", "hery", 1250],
      ["lalao", "fidy", 120000],
    ],
  );
});

test("fallback capture asks about an unknown trader", () => {
  const [d] = fallbackCapture(input("Bema owes Hery 40"));
  assert.equal(d.debtorId, null);
  assert.equal(d.confidence, "low");
  assert.match(d.question ?? "", /Bema/);
});

test("captureDebts without a key uses the fallback and labels it", async () => {
  const photo = await captureDebts({ imageBase64: "AAAA", traders, speakerId: "rivo" });
  assert.equal(photo.engine, "fallback");
  assert.match(photo.drafts[0].question ?? "", /AI key/);
  const none = await captureDebts(input("hello"));
  assert.equal(none.drafts.length, 1);
  assert.ok(none.drafts[0].question);
});

const modelDraft = (patch: Record<string, unknown> = {}) => ({
  drafts: [
    {
      debtorId: "soa",
      creditorId: "hery",
      debtorText: "Soa",
      creditorText: "Hery",
      amountCents: 30000,
      note: "rice",
      confidence: "high",
      question: null,
      ...patch,
    },
  ],
});

test("validation accepts good model output", () => {
  const [d] = validateDrafts(modelDraft(), traders);
  assert.deepEqual([d.debtorId, d.creditorId, d.amountCents, d.question], ["soa", "hery", 30000, undefined]);
  const [n] = validateDrafts(modelDraft({ amountCents: null }), traders);
  assert.ok(n.question);
});

test("validation rejects an unknown trader id, a bad amount and a bad confidence", () => {
  assert.throws(() => validateDrafts(modelDraft({ debtorId: "bema" }), traders), /unknown trader/);
  assert.throws(() => validateDrafts(modelDraft({ amountCents: 300.5 }), traders), /positive integer/);
  assert.throws(() => validateDrafts(modelDraft({ amountCents: -100 }), traders), /positive integer/);
  assert.throws(() => validateDrafts(modelDraft({ amountCents: "300" }), traders), /positive integer/);
  assert.throws(() => validateDrafts(modelDraft({ confidence: "sure" }), traders), /confidence/);
  assert.throws(() => validateDrafts({ drafts: "x" }, traders), /no drafts/);
});

const debt = (id: string, debtorId: string, creditorId: string, amountCents: number): Debt => ({
  id,
  debtorId,
  creditorId,
  amountCents,
  remainingCents: amountCents,
  note: "",
  source: "seed",
  status: "confirmed",
  debtorOk: true,
  creditorOk: true,
  createdAt: "2026-11-11T00:00:00Z",
});

test("resolve validation allows only the two claimed amounts or null", () => {
  const d = { ...debt("d1", "rivo", "hery", 5000), status: "disputed" as const, counterAmountCents: 4000, counterBy: "rivo" };
  assert.equal(validateResolution({ suggestion: "Check.", proposedAmountCents: 4000 }, d).proposedAmountCents, 4000);
  assert.equal(validateResolution({ suggestion: "Check.", proposedAmountCents: null }, d).proposedAmountCents, null);
  assert.throws(() => validateResolution({ suggestion: "Check.", proposedAmountCents: 4500 }, d), /not one of/);
  assert.throws(() => validateResolution({ suggestion: "", proposedAmountCents: null }, d), /no suggestion/);
});

const debts = [
  debt("d1", "soa", "hery", 30000),
  debt("d2", "fidy", "soa", 9000),
  debt("d3", "lalao", "soa", 15000),
  debt("d4", "soa", "rivo", 11000),
  debt("d5", "hery", "fidy", 12000), // does not involve soa
];

const round: Round = {
  id: "r1",
  status: "cleared",
  createdAt: "2026-11-11T00:00:00Z",
  debtsBefore: [],
  debtChanges: [
    { debtId: "d1", beforeCents: 30000, afterCents: 21000 },
    { debtId: "d2", beforeCents: 9000, afterCents: 0 },
    { debtId: "d3", beforeCents: 15000, afterCents: 15000 },
    { debtId: "d4", beforeCents: 11000, afterCents: 11000 },
    { debtId: "d5", beforeCents: 12000, afterCents: 3000 },
  ],
  result: {
    cancellations: [{ path: ["soa", "hery", "fidy"], amountCents: 9000 }],
    remaining: [],
    positions: [
      { traderId: "soa", netCents: -17000 },
      { traderId: "hery", netCents: 29000 },
    ],
    payIns: [{ traderId: "soa", amountCents: 17000 }],
    payOuts: [{ traderId: "hery", amountCents: 29000 }],
    stats: { grossCents: 0, clearedByCirclesCents: 0, remainingCents: 0, cashMovedCents: 0, savedPct: 0 },
  },
  settlements: [],
};

test("statement for soa: lines, net and action come from plain code", () => {
  const s = buildStatement(round, "soa", debts, traders);
  assert.equal(s.roundId, "r1");
  assert.equal(s.netCents, -17000);
  assert.equal(s.action, "pay_in");
  assert.deepEqual(
    s.lines.map((l) => [l.debtId, l.counterparty, l.direction, l.beforeCents, l.afterCents]),
    [
      ["d1", "Hery", "you_owe", 30000, 21000],
      ["d2", "Fidy", "owed_to_you", 9000, 0],
      ["d3", "Lalao", "owed_to_you", 15000, 15000],
      ["d4", "Rivo", "you_owe", 11000, 11000],
    ],
  );
  assert.match(s.summary, /\$180\.00/); // 90 + 90 cancelled
  assert.match(s.summary, /You pay \$170\.00/);
  assert.match(s.lines[1].reason, /all \$90\.00/);
});

test("statement action for a receiver and for a trader with no position", () => {
  assert.equal(buildStatement(round, "hery", debts, traders).action, "receive");
  const lalao = buildStatement(round, "lalao", debts, traders);
  assert.deepEqual([lalao.netCents, lalao.action], [0, "nothing"]);
});

test("model text is used, but an invented amount is rejected", () => {
  const s = buildStatement(round, "soa", debts, traders);
  const ok = applyExplanation({ summary: "You pay $170 now.", reasons: [{ debtId: "d2", reason: "Fidy's $90 cancelled." }] }, s, round);
  assert.equal(ok.summary, "You pay $170 now.");
  assert.equal(ok.lines[1].reason, "Fidy's $90 cancelled.");
  assert.equal(ok.lines[0].reason, s.lines[0].reason);
  assert.deepEqual(ok.lines.map((l) => l.afterCents), s.lines.map((l) => l.afterCents));
  assert.throws(() => applyExplanation({ summary: "You pay $160.", reasons: [] }, s, round), /not an amount/);
});
