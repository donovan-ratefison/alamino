// Activity log: what the clearing house sees live. Texts are built in plain code, never by the AI.
// Relative imports keep the `.ts` extension so `npm test` can load this file.

import { db, listTraders } from "./db.ts";
import { usd } from "./ai/model.ts";
import type { Activity, Debt, DebtSource, TraderId } from "./types.ts";

export function logActivity(a: Omit<Activity, "id" | "at">): void {
  db()
    .prepare("INSERT INTO activity (at, kind, actor, text, amountCents, debtId, roundId) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(new Date().toISOString(), a.kind, a.actor, a.text, a.amountCents ?? null, a.debtId ?? null, a.roundId ?? null);
}

// Newest first, only ids greater than `after`.
export function listActivity(after = 0, limit = 50): Activity[] {
  const rows = db().prepare("SELECT * FROM activity WHERE id > ? ORDER BY id DESC LIMIT ?").all(after, limit);
  return (rows as Record<string, unknown>[]).map((r) => {
    const a = { id: r.id, at: r.at, kind: r.kind, actor: r.actor, text: r.text } as Activity;
    if (r.amountCents !== null) a.amountCents = r.amountCents as number;
    if (r.debtId !== null) a.debtId = r.debtId as string;
    if (r.roundId !== null) a.roundId = r.roundId as string;
    return a;
  });
}

export const traderName = (id: TraderId) => listTraders().find((t) => t.id === id)?.name ?? id;

const owes = (d: Debt) => `${traderName(d.debtorId)} owes ${traderName(d.creditorId)} ${usd(d.amountCents)}`;
const otherSide = (d: Debt, id: TraderId) => traderName(id === d.debtorId ? d.creditorId : d.debtorId);

const HOW: Record<DebtSource, string> = { photo: "from a photo", text: "in one sentence", voice: "by voice", seed: "by hand" };

export function logDebtAdded(d: Debt, createdBy: TraderId): void {
  const end = d.status === "confirmed" ? "Confirmed." : `Waiting for ${otherSide(d, createdBy)}.`;
  logActivity({
    kind: "debt_added",
    actor: createdBy,
    text: `${traderName(createdBy)} added a debt ${HOW[d.source]}. ${owes(d)}. ${end}`,
    amountCents: d.amountCents,
    debtId: d.id,
  });
}

const STATE = ["status", "amountCents", "debtorOk", "creditorOk", "counterAmountCents", "counterBy"] as const;

// One entry per confirm call that changes the debt. A repeated call that changes nothing logs nothing.
export function logConfirm(before: Debt, after: Debt, traderId: TraderId, ok: boolean): void {
  if (STATE.every((k) => before[k] === after[k])) return;
  const who = traderName(traderId);
  const base = { actor: traderId, debtId: after.id };
  if (after.status === "confirmed") {
    logActivity({ ...base, kind: "debt_confirmed", amountCents: after.amountCents, text: `${who} approved. ${owes(after)}. The debt is confirmed.` });
  } else if (!ok) {
    const counter = after.counterAmountCents!;
    logActivity({ ...base, kind: "debt_disputed", amountCents: counter, text: `${who} says the amount is ${usd(counter)}, not ${usd(after.amountCents)}.` });
  } else {
    logActivity({
      ...base,
      kind: "debt_approved",
      amountCents: after.amountCents,
      text: `${who} approved ${owes(after)}. Waiting for ${otherSide(after, traderId)}.`,
    });
  }
}
