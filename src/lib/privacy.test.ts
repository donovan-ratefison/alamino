// Run with: node --test --experimental-strip-types src/lib/privacy.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Debt, Edge, Round } from "./types.ts";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "alamino-privacy-")), "test.db");
const { HttpError } = await import("./db.ts");
const { clear } = await import("./netting.ts");
const { debtsFor, previewFor, requireHouse, requireTraderOrHouse, roundFor, viewerOf } = await import("./privacy.ts");

// The nine demo debts (docs/ARCHITECTURE.md section 11).
const edges: Edge[] = [
  ["soa", "hery", 30000], ["hery", "fidy", 12000], ["fidy", "soa", 9000], ["lalao", "soa", 15000], ["soa", "rivo", 11000],
  ["rivo", "lalao", 7000], ["fidy", "rivo", 4000], ["lalao", "hery", 6000], ["rivo", "hery", 5000],
].map(([debtorId, creditorId, amountCents]) => ({ debtorId, creditorId, amountCents }) as Edge);
const debts = edges.map((e, i) => ({ ...e, id: `d${i}`, remainingCents: e.amountCents, status: "confirmed" }) as Debt);
const result = clear(edges);
const after = new Map(result.remaining.map((e) => [`${e.debtorId}>${e.creditorId}`, e.amountCents]));
const round: Round = {
  id: "r1",
  status: "collecting",
  createdAt: "2026-11-12T00:00:00Z",
  debtsBefore: edges,
  result,
  settlements: [
    ...result.payIns.map((p) => ({ ...p, direction: "pay_in" as const, status: p.traderId === "lalao" ? ("captured" as const) : ("none" as const) })),
    ...result.payOuts.map((p) => ({ ...p, direction: "pay_out" as const, status: "none" as const })),
  ],
  debtChanges: debts.map((d) => ({ debtId: d.id, beforeCents: d.amountCents, afterCents: after.get(`${d.debtorId}>${d.creditorId}`) ?? 0 })),
};

const touchesSoa = (e: Edge) => e.debtorId === "soa" || e.creditorId === "soa";
const req = (viewer?: string) => new Request("http://localhost", { headers: viewer ? { "x-alamino-viewer": viewer } : {} });
const status = (code: number) => (e: unknown) => e instanceof HttpError && e.status === code;

test("debtsFor: a trader gets only their debts, the house gets all", () => {
  assert.deepEqual(debtsFor(debts, "soa").map((d) => d.id), ["d0", "d2", "d3", "d4"]);
  assert.equal(debtsFor(debts, "house"), debts);
});

test("roundFor house: the round is unchanged, with no privacy", () => {
  const r = roundFor(round, "house", debts);
  assert.equal(r, round);
  assert.equal(r.privacy, undefined);
});

test("roundFor soa: only what touches soa, and soa's own stats", () => {
  const r = roundFor(round, "soa", debts);
  assert.ok(r.debtsBefore.length === 4 && r.debtsBefore.every(touchesSoa));
  assert.ok(r.result.remaining.every(touchesSoa));
  assert.deepEqual(r.result.positions, [{ traderId: "soa", netCents: -17000 }]);
  assert.deepEqual(r.result.payIns, [{ traderId: "soa", amountCents: 17000 }]);
  assert.deepEqual(r.result.payOuts, []);
  assert.deepEqual(r.settlements.map((s) => s.traderId), ["soa"]);
  assert.deepEqual(r.debtChanges.map((c) => c.debtId), ["d0", "d2", "d3", "d4"]);
  assert.deepEqual(r.result.stats, {
    grossCents: 65000,
    clearedByCirclesCents: 65000 - r.result.remaining.reduce((s, e) => s + e.amountCents, 0),
    remainingCents: r.result.remaining.reduce((s, e) => s + e.amountCents, 0),
    cashMovedCents: 17000,
    savedPct: 73.8,
  });
  // Lalao and Fidy pay in too. Lalao's pay-in is captured.
  assert.deepEqual(r.privacy, { viewer: "soa", otherPayments: { total: 2, done: 1 } });
  // Every circle starts with soa and no circle names more than 3 traders.
  assert.ok(r.result.cancellations.length > 0);
  for (const c of r.result.cancellations) {
    assert.equal(c.path[0], "soa");
    assert.ok(c.path.length <= 3);
  }
  // No edge between two other traders anywhere in the trader view.
  const json = JSON.stringify(r);
  for (const e of edges.filter((x) => !touchesSoa(x))) assert.ok(!json.includes(`"debtorId":"${e.debtorId}","creditorId":"${e.creditorId}"`));
});

test("roundFor: a circle of 4 becomes [viewer, next, prev] with 1 hidden trader, a circle of 2 keeps its path", () => {
  const r = roundFor(
    {
      ...round,
      result: {
        ...result,
        cancellations: [
          { path: ["a", "b", "c", "d"], amountCents: 100 },
          { path: ["c", "e"], amountCents: 50 },
          { path: ["a", "b", "d"], amountCents: 10 },
        ],
      },
    },
    "c",
    debts,
  );
  assert.deepEqual(r.result.cancellations, [
    { path: ["c", "d", "b"], amountCents: 100, hiddenTraders: 1 },
    { path: ["c", "e"], amountCents: 50 },
  ]);
});

test("previewFor: market stats for the house, own stats and action for a trader", () => {
  assert.deepEqual(previewFor(edges, "house"), { stats: result.stats });
  const soa = previewFor(edges, "soa");
  assert.equal(soa.stats?.grossCents, 65000);
  assert.equal(soa.stats?.cashMovedCents, 17000);
  assert.deepEqual([soa.action, soa.amountCents], ["pay_in", 17000]);
  assert.deepEqual([previewFor(edges, "hery").action, previewFor(edges, "hery").amountCents], ["receive", 29000]);
  assert.deepEqual(previewFor([], "soa"), { stats: null, action: "nothing", amountCents: 0 });
  assert.deepEqual(previewFor([], "house"), { stats: null });
});

test("viewerOf and the house access rule", () => {
  assert.equal(viewerOf(req()), "house");
  assert.equal(viewerOf(req("soa")), "soa");
  assert.throws(() => viewerOf(req("bema")), status(400));
  assert.throws(() => requireHouse(req("soa")), status(403));
  assert.doesNotThrow(() => requireHouse(req()));
  assert.throws(() => requireTraderOrHouse(req("soa"), "hery"), status(403));
  assert.doesNotThrow(() => requireTraderOrHouse(req("soa"), "soa"));
  assert.doesNotThrow(() => requireTraderOrHouse(req(), "soa"));

  // Sandbox keys and an admin password: the house needs the Finance sign-in.
  const keys = { PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret", FINANCE_ADMIN_PASSWORD: "a-password-of-16-chars" };
  const saved = Object.keys(keys).map((k) => [k, process.env[k]] as const);
  Object.assign(process.env, keys);
  try {
    assert.throws(() => viewerOf(req()), status(401));
    assert.equal(viewerOf(req("soa")), "soa");
    delete process.env.FINANCE_ADMIN_PASSWORD;
    assert.equal(viewerOf(req()), "house");
  } finally {
    for (const [k, v] of saved) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
