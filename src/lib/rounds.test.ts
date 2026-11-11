// Run with: node --test --experimental-strip-types src/lib/rounds.test.ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Debt } from "./types.ts";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "alamino-")), "test.db");
const { confirmDebt, getDebt, insertDebt, listDebts, listTraders, newId, updateDebt, updateSettlement, HttpError } =
  await import("./db.ts");
const { reset } = await import("./seed.ts");
const { finishRound, runRound } = await import("./rounds.ts");

const proposed = (debtorId: string, creditorId: string, cents: number, by: string): Debt =>
  insertDebt({
    id: newId("d"),
    debtorId,
    creditorId,
    amountCents: cents,
    remainingCents: cents,
    note: "test",
    source: "text",
    status: "proposed",
    debtorOk: by === debtorId,
    creditorOk: by === creditorId,
    createdAt: new Date().toISOString(),
  });

const status = (code: number) => (e: unknown) => e instanceof HttpError && e.status === code;

beforeEach(() => reset());

test("seed gives 5 traders and 8 confirmed debts", () => {
  assert.deepEqual(
    listTraders().map((t) => t.id),
    ["hery", "soa", "rivo", "lalao", "fidy"],
  );
  assert.equal(listDebts().length, 8);
  assert.equal(listDebts("confirmed").length, 8);
});

test("the demo round gives the documented result", () => {
  const d = proposed("rivo", "hery", 5000, "rivo");
  assert.equal(confirmDebt(d.id, "hery", true).status, "confirmed");

  const round = runRound();
  const { stats, payIns, payOuts, remaining } = round.result;
  assert.equal(stats.grossCents, 99000);
  assert.equal(stats.clearedByCirclesCents, 57000);
  assert.equal(stats.cashMovedCents, 32000);
  assert.deepEqual(
    round.settlements.filter((s) => s.direction === "pay_in").map((s) => [s.traderId, s.amountCents, s.status]),
    [["fidy", 1000, "none"], ["lalao", 14000, "none"], ["soa", 17000, "none"]],
  );
  assert.deepEqual(payIns.map((p) => [p.traderId, p.amountCents]).sort(), [["fidy", 1000], ["lalao", 14000], ["soa", 17000]]);
  assert.deepEqual(payOuts.map((p) => [p.traderId, p.amountCents]).sort(), [["hery", 29000], ["rivo", 3000]]);
  assert.equal(round.status, "cleared");
  assert.equal(round.debtChanges.length, 9);

  // Debt remainders match result.remaining per pair.
  const left = new Map<string, number>();
  for (const c of round.debtChanges) {
    const debt = getDebt(c.debtId)!;
    assert.equal(debt.remainingCents, c.afterCents);
    assert.equal(debt.status, c.afterCents === 0 ? "cleared" : "confirmed");
    const key = `${debt.debtorId}>${debt.creditorId}`;
    left.set(key, (left.get(key) ?? 0) + debt.remainingCents);
  }
  for (const e of remaining) assert.equal(left.get(`${e.debtorId}>${e.creditorId}`), e.amountCents);
  const total = [...left.values()].reduce((a, b) => a + b, 0);
  assert.equal(total, stats.remainingCents);

  // A second round waits for this one.
  assert.throws(() => runRound(), status(409));

  // A captured pay-in moves the round to collecting.
  assert.equal(updateSettlement(round.id, "soa", { status: "captured", paypalOrderId: "O-1" }).status, "collecting");

  const done = finishRound(round.id);
  assert.equal(done.status, "done");
  for (const c of done.debtChanges) assert.notEqual(getDebt(c.debtId)!.status, "confirmed");
  assert.throws(() => runRound(), status(409)); // no confirmed debt left
});

test("confirm rule 1: both sides approve, the debt is confirmed", () => {
  const d = proposed("rivo", "hery", 5000, "rivo");
  assert.throws(() => confirmDebt(d.id, "soa", true), status(400));
  assert.equal(confirmDebt(d.id, "rivo", true).status, "proposed");
  const c = confirmDebt(d.id, "hery", true);
  assert.equal(c.status, "confirmed");
  assert.throws(() => confirmDebt(d.id, "hery", true), status(409));
});

test("confirm rule 2: a counter amount disputes the debt", () => {
  const d = proposed("rivo", "hery", 5000, "rivo");
  const c = confirmDebt(d.id, "hery", false, 6000);
  assert.equal(c.status, "disputed");
  assert.equal(c.counterAmountCents, 6000);
  assert.equal(c.counterBy, "hery");
  assert.equal(c.creditorOk, false);
  assert.equal(c.amountCents, 5000);
});

test("confirm rule 3: accepting the other side's counter amount confirms it", () => {
  const d = proposed("rivo", "hery", 5000, "rivo");
  confirmDebt(d.id, "hery", false, 6000);
  const c = confirmDebt(d.id, "rivo", true, 6000);
  assert.equal(c.status, "confirmed");
  assert.equal(c.amountCents, 6000);
  assert.equal(c.remainingCents, 6000);
  assert.equal(c.counterAmountCents, undefined);
  assert.equal(c.counterBy, undefined);

  // A new amount that is not the stored counter goes back to the other side.
  const e = proposed("rivo", "hery", 5000, "rivo");
  confirmDebt(e.id, "hery", false, 6000);
  const f = confirmDebt(e.id, "rivo", true, 5500);
  assert.equal(f.status, "proposed");
  assert.equal(f.debtorOk, true);
  assert.equal(f.creditorOk, false);
});

test("a round with no pay-in is done at once", () => {
  for (const d of listDebts()) updateDebt(d.id, { status: "settled" });
  for (const [a, b] of [["soa", "hery"], ["hery", "fidy"], ["fidy", "soa"]]) {
    updateDebt(proposed(a, b, 1000, a).id, { status: "confirmed", creditorOk: true });
  }
  const round = runRound();
  assert.equal(round.status, "done");
  assert.deepEqual(round.settlements, []);
  assert.equal(listDebts("cleared").length, 3);
});
