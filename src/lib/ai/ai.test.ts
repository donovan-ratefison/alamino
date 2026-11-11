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

const sides = (d: { counterpartyId: unknown; direction: unknown; debtorId: unknown; creditorId: unknown; amountCents: unknown }) => [
  d.counterpartyId,
  d.direction,
  d.debtorId,
  d.creditorId,
  d.amountCents,
];

test("fallback capture: I owe and owes me", () => {
  const [a] = fallbackCapture(input("I owe Hery 50 for rice"));
  assert.deepEqual(sides(a), ["hery", "you_owe", "rivo", "hery", 5000]);
  assert.deepEqual([a.debtorText, a.creditorText, a.note, a.question], ["Rivo", "Hery", "rice", undefined]);
  const [b] = fallbackCapture(input("Hery owes me 120", "soa"));
  assert.deepEqual(sides(b), ["hery", "owed_to_you", "hery", "soa", 12000]);
  assert.deepEqual([b.debtorText, b.creditorText, b.question], ["Hery", "Soa", undefined]);
});

test("fallback capture refuses a debt between two other traders", () => {
  const [d] = fallbackCapture(input("Soa owes Hery 300"));
  assert.deepEqual(sides(d), [null, null, null, null, 30000]);
  assert.equal(d.question, "This debt is between Soa and Hery. Add only your own debts.");
  assert.equal(d.confidence, "low");
});

test("fallback capture reads the speaker's own name as I", () => {
  const [d] = fallbackCapture(input("Rivo owes Hery 50"));
  assert.deepEqual(sides(d), ["hery", "you_owe", "rivo", "hery", 5000]);
});

test("fallback capture asks about an unknown trader", () => {
  const [d] = fallbackCapture(input("I owe Zaza 50"));
  assert.deepEqual(sides(d), [null, "you_owe", null, null, 5000]);
  assert.equal(d.counterpartyText, "Zaza");
  assert.equal(d.confidence, "low");
  assert.equal(d.question, undefined); // the screen asks, not the fallback
});

test("fallback capture matches aliases, cents and several sentences", () => {
  const drafts = fallbackCapture(input("the restaurant owes rakoto $12.50 for oil. Fidy owes me 1,200", "soa"));
  assert.deepEqual(drafts.map(sides), [
    ["hery", "you_owe", "soa", "hery", 1250],
    ["fidy", "owed_to_you", "fidy", "soa", 120000],
  ]);
});

test("captureDebts without a key uses the fallback and labels it", async () => {
  const photo = await captureDebts({ imageBase64: "AAAA", traders, speakerId: "rivo" });
  assert.equal(photo.engine, "fallback");
  assert.deepEqual(sides(photo.drafts[0]), [null, null, null, null, null]);
  assert.match(photo.drafts[0].question ?? "", /AI key/);
  const none = await captureDebts(input("hello"));
  assert.equal(none.drafts.length, 1);
  assert.ok(none.drafts[0].question);
});

const modelDraft = (patch: Record<string, unknown> = {}) => ({
  counterpartyId: "hery",
  counterpartyText: "Hery",
  direction: "you_owe",
  amountCents: 30000,
  note: "rice",
  confidence: "high",
  question: null,
  ...patch,
});
const validate = (patch: Record<string, unknown> = {}, speakerId = "soa") =>
  validateDrafts({ drafts: [modelDraft(patch)] }, traders, speakerId)[0];

test("validation derives debtor and creditor from the direction", () => {
  const owe = validate();
  assert.deepEqual(sides(owe), ["hery", "you_owe", "soa", "hery", 30000]);
  assert.deepEqual([owe.debtorText, owe.creditorText, owe.confidence], ["Soa", "Hery", "high"]);
  assert.equal("question" in owe, false);
  const owed = validate({ direction: "owed_to_you" });
  assert.deepEqual(sides(owed), ["hery", "owed_to_you", "hery", "soa", 30000]);
  assert.deepEqual([owed.debtorText, owed.creditorText], ["Hery", "Soa"]);
});

test("validation never keeps the speaker or an unknown id as the counterparty", () => {
  const self = validate({ counterpartyId: "soa", counterpartyText: "Soa" });
  assert.deepEqual(sides(self), [null, "you_owe", null, null, 30000]);
  assert.equal(self.confidence, "low");
  const unknown = validate({ counterpartyId: "bema", counterpartyText: "Bema" });
  assert.deepEqual(sides(unknown), [null, "you_owe", null, null, 30000]);
  assert.deepEqual([unknown.counterpartyText, unknown.confidence], ["Bema", "low"]);
});

test("validation gives low confidence when the direction or the amount is missing", () => {
  const way = validate({ direction: "sideways" });
  assert.deepEqual(sides(way), ["hery", null, null, null, 30000]);
  assert.deepEqual([way.debtorText, way.creditorText], ["", "Hery"]);
  assert.equal(way.confidence, "low");
  for (const amountCents of [null, 300.5, -100, "300"]) {
    const d = validate({ amountCents });
    assert.equal(d.amountCents, null);
    assert.equal(d.confidence, "low");
  }
});

test("validation keeps the model question on an incomplete draft only", () => {
  const complete = validate({ question: "Which way does the debt with Fidy go?", confidence: "medium" });
  assert.deepEqual(sides(complete), ["hery", "you_owe", "soa", "hery", 30000]);
  assert.equal("question" in complete, false);
  assert.equal(complete.confidence, "low");
  const open = validate({ direction: null, question: "Which way does the debt go?", confidence: "medium" });
  assert.deepEqual([open.question, open.confidence], ["Which way does the debt go?", "medium"]);
});

test("validation drops an empty question and rejects a bad structure", () => {
  assert.equal(validate({ question: " " }).question, undefined);
  assert.equal(validate({ confidence: "sure" }).confidence, "low");
  assert.throws(() => validateDrafts({ drafts: "x" }, traders, "soa"), /no drafts/);
  assert.throws(() => validateDrafts({ drafts: [modelDraft({ note: 1 })] }, traders, "soa"), /not text/);
});

test("Soa's notebook page: every draft has Soa on one side", () => {
  // Ananan'i Hery vary za - 300 / Soa - 50 / Fidy moto - 18
  const [hery, self, fidy] = validateDrafts(
    {
      drafts: [
        modelDraft({ counterpartyText: "Hery vary" }),
        modelDraft({
          counterpartyId: null,
          counterpartyText: "Soa",
          amountCents: 5000,
          note: "",
          confidence: "low",
          question: "Who is the other trader for the 50 line?",
        }),
        modelDraft({ counterpartyId: "fidy", counterpartyText: "Fidy moto", amountCents: 1800, note: "motorbike", confidence: "medium" }),
      ],
    },
    traders,
    "soa",
  );
  assert.deepEqual(sides(hery), ["hery", "you_owe", "soa", "hery", 30000]);
  assert.equal(hery.question, undefined);
  assert.deepEqual(sides(self), [null, "you_owe", null, null, 5000]);
  assert.equal(self.question, "Who is the other trader for the 50 line?");
  assert.deepEqual(sides(fidy), ["fidy", "you_owe", "soa", "fidy", 1800]);
  assert.deepEqual([fidy.confidence, fidy.question], ["medium", undefined]);
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
  assert.match(s.summary, /cancelled \$180 of/); // 90 + 90 cancelled
  assert.match(s.summary, /You pay \$170 into/);
  assert.match(s.lines[1].reason, /all \$90 of/);
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
