// Run with: node --test --experimental-strip-types src/lib/netting.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { clear, positionsOf } from "./netting.ts";
import type { Edge } from "./types.ts";

const e = (debtorId: string, creditorId: string, amountCents: number): Edge => ({
  debtorId,
  creditorId,
  amountCents,
});

test("a perfect circle clears with no money moving", () => {
  const r = clear([e("soa", "hery", 10000), e("hery", "fidy", 10000), e("fidy", "soa", 10000)]);
  assert.equal(r.remaining.length, 0);
  assert.equal(r.stats.cashMovedCents, 0);
  assert.equal(r.stats.clearedByCirclesCents, 30000);
  assert.equal(r.stats.savedPct, 100);
  assert.deepEqual(r.payIns, []);
  assert.deepEqual(r.payOuts, []);
});

test("an uneven circle leaves a remainder settled by net position", () => {
  const r = clear([e("soa", "hery", 10000), e("hery", "fidy", 8000), e("fidy", "soa", 6000)]);
  assert.deepEqual(r.cancellations, [{ path: ["fidy", "soa", "hery"], amountCents: 6000 }]);
  assert.deepEqual(r.remaining, [e("hery", "fidy", 2000), e("soa", "hery", 4000)]);
  assert.deepEqual(r.payIns, [{ traderId: "soa", amountCents: 4000 }]);
  assert.deepEqual(r.payOuts, [
    { traderId: "fidy", amountCents: 2000 },
    { traderId: "hery", amountCents: 2000 },
  ]);
  assert.equal(r.stats.grossCents, 24000);
  assert.equal(r.stats.clearedByCirclesCents, 18000);
  assert.equal(r.stats.cashMovedCents, 4000);
});

test("debts in both directions between two traders cancel", () => {
  const r = clear([e("a", "b", 5000), e("b", "a", 3000)]);
  assert.deepEqual(r.remaining, [e("a", "b", 2000)]);
  assert.equal(r.stats.cashMovedCents, 2000);
});

test("a chain has no circle but the middle trader pays nothing", () => {
  const r = clear([e("a", "b", 10000), e("b", "c", 10000)]);
  assert.equal(r.cancellations.length, 0);
  assert.deepEqual(r.payIns, [{ traderId: "a", amountCents: 10000 }]);
  assert.deepEqual(r.payOuts, [{ traderId: "c", amountCents: 10000 }]);
  assert.equal(r.stats.cashMovedCents, 10000);
  assert.equal(r.stats.savedPct, 50);
});

test("several debts between the same pair are added together", () => {
  const r = clear([e("a", "b", 1000), e("a", "b", 2500)]);
  assert.deepEqual(r.remaining, [e("a", "b", 3500)]);
});

test("net positions are the same before and after clearing, and sum to zero", () => {
  const debts = [
    e("hery", "fidy", 12000),
    e("soa", "hery", 30000),
    e("fidy", "soa", 9000),
    e("rivo", "lalao", 7000),
    e("lalao", "soa", 15000),
    e("soa", "rivo", 11000),
    e("fidy", "rivo", 4000),
    e("lalao", "hery", 6000),
    e("rivo", "hery", 5000),
  ];
  const r = clear(debts);
  assert.deepEqual(r.positions, positionsOf(debts));
  assert.equal(r.positions.reduce((s, p) => s + p.netCents, 0), 0);
  const paidIn = r.payIns.reduce((s, p) => s + p.amountCents, 0);
  const paidOut = r.payOuts.reduce((s, p) => s + p.amountCents, 0);
  assert.equal(paidIn, paidOut);
  assert.ok(r.stats.cashMovedCents <= r.stats.remainingCents);
  assert.ok(r.stats.remainingCents <= r.stats.grossCents);
});

test("nothing is left with a circle in it", () => {
  const debts = [
    e("a", "b", 700),
    e("b", "c", 500),
    e("c", "a", 900),
    e("c", "d", 300),
    e("d", "b", 400),
    e("d", "a", 100),
  ];
  const r = clear(debts);
  const again = clear(r.remaining);
  assert.equal(again.cancellations.length, 0);
});

test("bad input is rejected", () => {
  assert.throws(() => clear([e("a", "a", 100)]));
  assert.throws(() => clear([e("a", "b", -1)]));
  assert.throws(() => clear([e("a", "b", 10.5)]));
});

test("no debts gives an empty result", () => {
  const r = clear([]);
  assert.equal(r.stats.grossCents, 0);
  assert.equal(r.stats.savedPct, 0);
});
