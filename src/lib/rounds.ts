// Run a clearing round and apply it to the debts. See docs/ARCHITECTURE.md "Round rules".

import { db, getRound, HttpError, insertRound, latestRound, listDebts, newId, setRoundStatus, updateDebt } from "./db.ts";
import { logActivity } from "./activity.ts";
import { usd } from "./ai/model.ts";
import { clear } from "./netting.ts";
import { HOUSE } from "./types.ts";
import type { DebtChange, Edge, Round, Settlement } from "./types.ts";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const pairKey = (debtorId: string, creditorId: string) => `${debtorId}>${creditorId}`;

export function runRound(): Round {
  return db().transaction(() => {
    const open = latestRound();
    if (open && open.status !== "done") throw new HttpError(409, `Round ${open.id} is still ${open.status}`);
    const debts = listDebts("confirmed");
    if (debts.length === 0) throw new HttpError(409, "No confirmed debt to clear");

    // One edge per pair, like result.remaining.
    const before = new Map<string, Edge>();
    for (const d of debts) {
      const key = pairKey(d.debtorId, d.creditorId);
      const e = before.get(key) ?? { debtorId: d.debtorId, creditorId: d.creditorId, amountCents: 0 };
      e.amountCents += d.remainingCents;
      before.set(key, e);
    }
    const debtsBefore = [...before.values()];
    const result = clear(debtsBefore);
    const after = new Map(result.remaining.map((e) => [pairKey(e.debtorId, e.creditorId), e.amountCents]));

    // Take each pair's reduction from its oldest debts first.
    const reduction = new Map(
      [...before].map(([key, e]) => [key, e.amountCents - (after.get(key) ?? 0)]),
    );
    const debtChanges: DebtChange[] = [];
    const oldestFirst = [...debts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const d of oldestFirst) {
      const key = pairKey(d.debtorId, d.creditorId);
      const take = Math.min(d.remainingCents, reduction.get(key)!);
      reduction.set(key, reduction.get(key)! - take);
      const afterCents = d.remainingCents - take;
      debtChanges.push({ debtId: d.id, beforeCents: d.remainingCents, afterCents });
      if (take > 0) updateDebt(d.id, { remainingCents: afterCents, ...(afterCents === 0 ? { status: "cleared" } : {}) });
    }

    const settlements: Settlement[] = [
      ...result.payIns.map((p) => ({ ...p, direction: "pay_in" as const, status: "none" as const })),
      ...result.payOuts.map((p) => ({ ...p, direction: "pay_out" as const, status: "none" as const })),
    ];
    const round = insertRound({
      id: newId("r"),
      status: "cleared",
      createdAt: new Date().toISOString(),
      debtsBefore,
      result,
      settlements,
      debtChanges,
    });
    const s = result.stats;
    logActivity({
      kind: "round_run",
      actor: HOUSE,
      text:
        `Clearing round run. Circles cancelled ${usd(s.clearedByCirclesCents)}. No cash moved. ` +
        `Net plan: ${plural(result.payIns.length, "pay-in")}, ${plural(result.payOuts.length, "payout")}, ${usd(s.cashMovedCents)} in total.`,
      amountCents: s.cashMovedCents,
      roundId: round.id,
    });
    // No pay-in means no pay-out: nothing to wait for.
    return result.payIns.length === 0 ? finishRound(round.id) : round;
  })();
}

// Called when all payouts are confirmed: debts left `confirmed` become `settled`, round `done`.
export function finishRound(roundId: string): Round {
  return db().transaction(() => {
    const round = getRound(roundId);
    if (!round) throw new HttpError(404, `No round ${roundId}`);
    const settle = db().prepare("UPDATE debts SET status = 'settled' WHERE id = ? AND status = 'confirmed'");
    for (const c of round.debtChanges) settle.run(c.debtId);
    if (round.status !== "done") {
      logActivity({ kind: "round_done", actor: HOUSE, text: "Round settled. Every debt of the round is closed.", roundId });
    }
    return setRoundStatus(roundId, "done");
  })();
}
