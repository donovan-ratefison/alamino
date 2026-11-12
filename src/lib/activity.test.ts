// Run with: node --test --experimental-strip-types src/lib/activity.test.ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "alamino-")), "test.db");
const { confirmDebt, insertDebt, newId, updateSettlement } = await import("./db.ts");
const { reset } = await import("./seed.ts");
const { finishRound, runRound } = await import("./rounds.ts");
const { listActivity, logDebtAdded } = await import("./activity.ts");

// What POST /api/debts does: insert, then log.
const add = (debtorId: string, creditorId: string, cents: number, by: string) => {
  const d = insertDebt({
    id: newId("d"),
    debtorId,
    creditorId,
    amountCents: cents,
    remainingCents: cents,
    note: "test",
    source: "photo",
    status: "proposed",
    debtorOk: by === debtorId,
    creditorOk: by === creditorId,
    createdAt: new Date().toISOString(),
  });
  logDebtAdded(d, by);
  return d;
};

const kinds = () => listActivity().map((a) => a.kind).reverse();
const last = () => listActivity()[0];

beforeEach(() => reset());

test("reset logs one demo_loaded entry with the seeded total", () => {
  reset();
  const all = listActivity();
  assert.equal(all.length, 1);
  assert.equal(all[0].kind, "demo_loaded");
  assert.equal(all[0].actor, "house");
  assert.equal(all[0].text, "8 confirmed debts loaded. Total $940.");
  assert.equal(all[0].amountCents, 94000);
});

test("adding then confirming a debt logs debt_added then debt_confirmed", () => {
  const d = add("rivo", "hery", 5000, "rivo");
  assert.deepEqual(last(), {
    ...last(),
    kind: "debt_added",
    actor: "rivo",
    text: "Rivo added a debt from a photo. Rivo owes Hery $50. Waiting for Hery.",
    amountCents: 5000,
    debtId: d.id,
  });
  confirmDebt(d.id, "hery", true);
  assert.equal(last().kind, "debt_confirmed");
  assert.equal(last().text, "Hery approved. Rivo owes Hery $50. The debt is confirmed.");
  assert.deepEqual(kinds(), ["demo_loaded", "debt_added", "debt_confirmed"]);
});

test("approve and dispute texts, no entry on a repeated no-op", () => {
  const d = add("rivo", "hery", 5000, "hery");
  confirmDebt(d.id, "rivo", false, 6000);
  assert.equal(last().text, "Rivo says the amount is $60, not $50.");
  confirmDebt(d.id, "rivo", false, 6000); // same counter again: nothing changes
  confirmDebt(d.id, "hery", true); // hery approved already: nothing changes
  assert.deepEqual(kinds(), ["demo_loaded", "debt_added", "debt_disputed"]);

  const e = add("soa", "lalao", 1250, "soa");
  confirmDebt(e.id, "lalao", true, 1500);
  assert.equal(last().kind, "debt_approved");
  assert.equal(last().text, "Lalao approved Soa owes Lalao $15. Waiting for Soa.");
});

test("a round logs round_run, pay-ins and round_done once", () => {
  const d = add("rivo", "hery", 5000, "rivo");
  confirmDebt(d.id, "hery", true);
  const round = runRound();
  const run = last();
  assert.equal(run.kind, "round_run");
  assert.equal(run.roundId, round.id);
  assert.equal(run.amountCents, 32000);
  assert.equal(run.text, "Clearing round run. Circles cancelled $570. No cash moved. Net plan: 3 pay-ins, 2 payouts, $320 in total.");

  updateSettlement(round.id, "soa", { status: "captured" });
  assert.equal(last().text, "Soa paid $170 through PayPal.");
  updateSettlement(round.id, "soa", { status: "captured" }); // no change
  updateSettlement(round.id, "fidy", { status: "captured" });
  updateSettlement(round.id, "lalao", { status: "captured" });
  assert.equal(last().text, "Lalao paid $140 through PayPal. All pay-ins captured.");

  finishRound(round.id);
  finishRound(round.id); // already done
  assert.equal(last().text, "Round settled. Every debt of the round is closed.");
  assert.deepEqual(kinds().slice(3), ["round_run", "payin_captured", "payin_captured", "payin_captured", "round_done"]);
});

test("listActivity(after) returns only newer entries, newest first", () => {
  const first = last().id;
  add("rivo", "hery", 5000, "rivo");
  add("soa", "fidy", 2000, "soa");
  const newer = listActivity(first);
  assert.equal(newer.length, 2);
  assert.ok(newer[0].id > newer[1].id && newer[1].id > first);
  assert.deepEqual(listActivity(newer[0].id), []);
});
