// Builds one trader's statement for a round. All numbers come from plain code.
// The model only writes `summary` and each line's `reason`.
import type { Debt, Round, Statement, Trader, TraderId } from "../types.ts";
import { aiMode, askJson, isObject, usd } from "./model.ts";

type Line = Statement["lines"][number];

const cut = (l: Line) => l.beforeCents - l.afterCents;

function lineReason(l: Line): string {
  if (l.afterCents === 0) return `A circle cancelled all ${usd(cut(l))} of this debt. No money moved.`;
  if (cut(l) > 0) return `A circle cancelled ${usd(cut(l))}. The other ${usd(l.afterCents)} is part of your net position.`;
  return `This debt was not in a circle. All ${usd(l.afterCents)} is part of your net position.`;
}

function summaryText(lines: Line[], netCents: number, action: Statement["action"]): string {
  const total = lines.reduce((sum, l) => sum + cut(l), 0);
  const first =
    total > 0 ? `Circles cancelled ${usd(total)} of your debts with no money moved.` : "No circle included your debts in this round.";
  const second =
    action === "pay_in"
      ? `You pay ${usd(-netCents)} into the clearing account.`
      : action === "receive"
        ? `You receive ${usd(netCents)} from the clearing account.`
        : "What you owe and what you are owed are equal, so you pay nothing and receive nothing.";
  return `${first} ${second}`;
}

// ponytail: the template text here is also the fallback without AI_API_KEY.
export function buildStatement(round: Round, traderId: TraderId, debts: Debt[], traders: Trader[]): Statement {
  const name = (id: TraderId) => traders.find((t) => t.id === id)?.name ?? id;
  const lines = round.debtChanges.flatMap((c): Line[] => {
    const d = debts.find((x) => x.id === c.debtId);
    if (!d || (d.debtorId !== traderId && d.creditorId !== traderId)) return [];
    const youOwe = d.debtorId === traderId;
    const line: Line = {
      debtId: c.debtId,
      counterparty: name(youOwe ? d.creditorId : d.debtorId),
      direction: youOwe ? "you_owe" : "owed_to_you",
      beforeCents: c.beforeCents,
      afterCents: c.afterCents,
      reason: "",
    };
    return [{ ...line, reason: lineReason(line) }];
  });
  const netCents = round.result.positions.find((p) => p.traderId === traderId)?.netCents ?? 0;
  const action = netCents < 0 ? "pay_in" : netCents > 0 ? "receive" : "nothing";
  return { traderId, roundId: round.id, summary: summaryText(lines, netCents, action), lines, netCents, action };
}

// Every dollar figure in the model text must be a number of this statement.
function allowedCents(s: Statement, round: Round): Set<number> {
  const circles = round.result.cancellations.filter((c) => c.path.includes(s.traderId)).map((c) => c.amountCents);
  const lines = s.lines.flatMap((l) => [l.beforeCents, l.afterCents, cut(l)]);
  return new Set([...lines, ...circles, Math.abs(s.netCents), s.lines.reduce((sum, l) => sum + cut(l), 0)]);
}

// Puts the model text on the statement. Throws on output the app cannot trust.
export function applyExplanation(raw: unknown, s: Statement, round: Round): Statement {
  if (!isObject(raw) || typeof raw.summary !== "string" || !raw.summary.trim() || !Array.isArray(raw.reasons))
    throw new Error("Invalid explain output: no summary or reasons");
  const allowed = allowedCents(s, round);
  const check = (text: string) => {
    for (const m of text.matchAll(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/g)) {
      const cents = Math.round(Number(m[1].replace(/,/g, "")) * 100);
      if (!allowed.has(cents)) throw new Error(`Invalid explain output: ${usd(cents)} is not an amount of this statement`);
    }
    return text;
  };
  const reasons = new Map<string, string>();
  for (const r of raw.reasons)
    if (isObject(r) && typeof r.debtId === "string" && typeof r.reason === "string" && r.reason.trim())
      reasons.set(r.debtId, check(r.reason.trim()));
  return {
    ...s,
    summary: check(raw.summary.trim()),
    lines: s.lines.map((l) => ({ ...l, reason: reasons.get(l.debtId) ?? l.reason })),
  };
}

export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "reasons"],
  properties: {
    summary: { type: "string" },
    reasons: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["debtId", "reason"],
        properties: { debtId: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
};

// ponytail: in-memory, lost on restart. Round and trader ids are unique across resets, so no invalidation is needed.
const cache = new Map<string, Statement>(); // only statements with model text

export async function explainRound(round: Round, traderId: TraderId, debts: Debt[], traders: Trader[]): Promise<Statement> {
  const key = `${round.id}:${traderId}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const s = buildStatement(round, traderId, debts, traders);
  if (aiMode() !== "model") return s;
  const name = (id: TraderId) => traders.find((t) => t.id === id)?.name ?? id;
  const facts = {
    trader: name(traderId),
    debts: s.lines.map((l) => ({
      debtId: l.debtId,
      direction: l.direction === "you_owe" ? `you owe ${l.counterparty}` : `${l.counterparty} owes you`,
      before: usd(l.beforeCents),
      cancelledByCircles: usd(cut(l)),
      left: usd(l.afterCents),
    })),
    circles: round.result.cancellations
      .filter((c) => c.path.includes(traderId))
      .map((c) => ({ traders: c.path.map(name), cancelledFromEachDebt: usd(c.amountCents) })),
    whatYouDoNow: { pay_in: `pay ${usd(-s.netCents)} into the clearing account`, receive: `receive ${usd(s.netCents)} from the clearing account`, nothing: "pay nothing and receive nothing" }[s.action],
  };
  try {
    const raw = await askJson(
      [
        "You explain a debt clearing round to one market trader. Write plain, short sentences in simple English. Talk to the trader as \"you\".",
        "The numbers are final and come from the clearing engine. Use only the dollar amounts given. Do not add, subtract or invent amounts.",
        "summary: two or three sentences. Say what the circles cancelled, what is left, and what the trader does now.",
        "reasons: one sentence for each debt, with the same debtId. Say why the debt changed or did not change.",
      ].join("\n"),
      [{ type: "text", text: JSON.stringify(facts, null, 2) }],
      "round_statement",
      SCHEMA,
    );
    const explained = applyExplanation(raw, s, round);
    cache.set(key, explained);
    return explained;
  } catch (e) {
    console.error("explainRound: model call failed, using the template text.", e);
    return s;
  }
}
