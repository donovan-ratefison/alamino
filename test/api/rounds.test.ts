import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "alamino-api-rounds-")), "test.db");

const { reset } = await import("@/lib/seed");
const { NextRequest } = await import("next/server");

const { POST: postDebt } = await import("@/app/api/debts/route");
const { POST: confirmDebtRoute } = await import("@/app/api/debts/[id]/confirm/route");
const { GET: previewRoute } = await import("@/app/api/rounds/preview/route");
const { POST: runRoundRoute } = await import("@/app/api/rounds/route");
const { GET: getRoundRoute } = await import("@/app/api/rounds/[id]/route");
const { GET: getStatementRoute } = await import("@/app/api/rounds/[id]/statement/[traderId]/route");
const { POST: createOrderRoute } = await import("@/app/api/rounds/[id]/payin/[traderId]/order/route");
const { POST: capturePayinRoute } = await import("@/app/api/rounds/[id]/payin/[traderId]/capture/route");
const { POST: createPayoutRoute } = await import("@/app/api/rounds/[id]/payout/route");
const { POST: refreshPayoutRoute } = await import("@/app/api/rounds/[id]/payout/refresh/route");

async function addNinthDebt() {
  const postRes = await postDebt(
    new Request("http://localhost/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debtorId: "rivo", creditorId: "hery", amountCents: 5000, source: "text", createdBy: "rivo" }),
    }),
  );
  const debt = await postRes.json();
  await confirmDebtRoute(
    new Request(`http://localhost/api/debts/${debt.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traderId: "hery", ok: true }),
    }),
    { params: Promise.resolve({ id: debt.id }) },
  );
  return debt;
}

beforeEach(() => {
  reset();
});

// No header: the viewer is the house (open in simulated mode). With a trader id: that trader.
const house = () => new Request("http://localhost");
const as = (viewer: string, init: RequestInit = {}) =>
  new Request("http://localhost", { ...init, headers: { ...init.headers, "x-alamino-viewer": viewer } });

test("GET /api/rounds/preview calculates clearing statistics without creating a round", async () => {
  await addNinthDebt();
  const res = await previewRoute(house());
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.stats);
  assert.equal(data.stats.grossCents, 99000);
  assert.equal(data.stats.clearedByCirclesCents, 57000);
  assert.equal(data.stats.cashMovedCents, 32000);
});

test("POST /api/rounds runs clearing and GET /api/rounds/[id] retrieves it", async () => {
  await addNinthDebt();
  const res = await runRoundRoute(house());
  assert.equal(res.status, 200);
  const round = await res.json();
  assert.equal(round.status, "cleared");
  assert.equal(round.settlements.length, 5);

  // Retrieve by ID
  const getRes = await getRoundRoute(new Request("http://localhost"), { params: Promise.resolve({ id: round.id }) });
  assert.equal(getRes.status, 200);
  const fetched = await getRes.json();
  assert.equal(fetched.id, round.id);

  // Retrieve by "latest"
  const latestRes = await getRoundRoute(new Request("http://localhost"), { params: Promise.resolve({ id: "latest" }) });
  assert.equal(latestRes.status, 200);
  const latest = await latestRes.json();
  assert.equal(latest.id, round.id);

  // Unknown ID -> 404
  const unknownRes = await getRoundRoute(new Request("http://localhost"), { params: Promise.resolve({ id: "nonexistent" }) });
  assert.equal(unknownRes.status, 404);

  // Running a second round while current is active -> 409
  const conflictRes = await runRoundRoute(house());
  assert.equal(conflictRes.status, 409);
});

test("GET /api/rounds/[id]/statement/[traderId] produces statements for traders", async () => {
  await addNinthDebt();
  const runRes = await runRoundRoute(house());
  const round = await runRes.json();

  // Plain statement for soa (who owes $170)
  const req = new NextRequest(`http://localhost/api/rounds/${round.id}/statement/soa?text=plain`);
  const res = await getStatementRoute(req, { params: Promise.resolve({ id: round.id, traderId: "soa" }) });
  assert.equal(res.status, 200);
  const statement = await res.json();
  assert.equal(statement.roundId, round.id);
  assert.equal(statement.traderId, "soa");
  assert.equal(statement.netCents, -17000);
  assert.equal(statement.action, "pay_in");
  assert.ok(statement.summary.includes("$170"));

  // Unknown round -> 404
  const unknownRoundReq = new NextRequest("http://localhost/api/rounds/unknown/statement/soa");
  const unknownRoundRes = await getStatementRoute(unknownRoundReq, { params: Promise.resolve({ id: "unknown", traderId: "soa" }) });
  assert.equal(unknownRoundRes.status, 404);

  // Unknown trader -> 404
  const unknownTraderReq = new NextRequest(`http://localhost/api/rounds/${round.id}/statement/unknown`);
  const unknownTraderRes = await getStatementRoute(unknownTraderReq, { params: Promise.resolve({ id: round.id, traderId: "unknown" }) });
  assert.equal(unknownTraderRes.status, 404);
});

test("Settlement lifecycle: pay-in orders, captures, payouts, and payout refresh", async () => {
  await addNinthDebt();
  const runRes = await runRoundRoute(house());
  const round = await runRes.json();

  // Pay-ins in this round: soa ($170), lalao ($140), fidy ($10)
  const payIns = round.settlements.filter((s: { direction: string }) => s.direction === "pay_in");
  assert.equal(payIns.length, 3);

  // Attempting payout before pay-ins are captured -> 409
  const prematurePayout = await createPayoutRoute(new Request("http://localhost"), { params: Promise.resolve({ id: round.id }) });
  assert.equal(prematurePayout.status, 409);

  // Capture every pay-in through the order + capture endpoints
  for (const p of payIns) {
    const orderRes = await createOrderRoute(new Request("http://localhost"), {
      params: Promise.resolve({ id: round.id, traderId: p.traderId }),
    });
    assert.equal(orderRes.status, 200);
    const { orderId } = await orderRes.json();
    assert.ok(orderId.startsWith("SIM-"));

    // Capture with wrong order ID -> 400
    const badCapture = await capturePayinRoute(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "WRONG_ORDER_ID" }),
      }),
      { params: Promise.resolve({ id: round.id, traderId: p.traderId }) },
    );
    assert.equal(badCapture.status, 400);

    // Capture with correct order ID -> 200
    const captureRes = await capturePayinRoute(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      }),
      { params: Promise.resolve({ id: round.id, traderId: p.traderId }) },
    );
    assert.equal(captureRes.status, 200);
    const updatedS = await captureRes.json();
    assert.equal(updatedS.status, "captured");
  }

  // Once all pay-ins are captured, initiate payout batch
  const payoutRes = await createPayoutRoute(new Request("http://localhost"), { params: Promise.resolve({ id: round.id }) });
  assert.equal(payoutRes.status, 200);
  const payingRound = await payoutRes.json();
  assert.equal(payingRound.status, "paying");

  // Refresh payout status to confirm payouts and mark round "done"
  const refreshRes = await refreshPayoutRoute(new Request("http://localhost"), { params: Promise.resolve({ id: round.id }) });
  assert.equal(refreshRes.status, 200);
  const doneRound = await refreshRes.json();
  assert.equal(doneRound.status, "done");
});

test("GET /api/rounds/preview as a trader returns only their numbers and action", async () => {
  await addNinthDebt();
  const data = await (await previewRoute(as("soa"))).json();
  assert.deepEqual(data.stats, { grossCents: 65000, clearedByCirclesCents: data.stats.clearedByCirclesCents, remainingCents: 65000 - data.stats.clearedByCirclesCents, cashMovedCents: 17000, savedPct: 73.8 });
  assert.equal(data.action, "pay_in");
  assert.equal(data.amountCents, 17000);
  assert.equal((await previewRoute(as("bema"))).status, 400);
});

test("A trader cannot run clearing or send payouts", async () => {
  await addNinthDebt();
  assert.equal((await runRoundRoute(as("soa"))).status, 403);
  const round = await (await runRoundRoute(house())).json();
  assert.equal((await createPayoutRoute(as("hery"), { params: Promise.resolve({ id: round.id }) })).status, 403);
});

test("A trader gets only their part of a round", async () => {
  await addNinthDebt();
  const round = await (await runRoundRoute(house())).json();
  const res = await getRoundRoute(as("soa"), { params: Promise.resolve({ id: "latest" }) });
  assert.equal(res.status, 200);
  const mine = await res.json();
  const touches = (e: { debtorId: string; creditorId: string }) => e.debtorId === "soa" || e.creditorId === "soa";
  assert.equal(mine.id, round.id);
  assert.ok(mine.debtsBefore.every(touches) && mine.result.remaining.every(touches));
  assert.deepEqual(mine.settlements.map((s: { traderId: string }) => s.traderId), ["soa"]);
  assert.equal(mine.result.stats.grossCents, 65000);
  assert.deepEqual(mine.privacy, { viewer: "soa", otherPayments: { total: 2, done: 0 } });
  for (const c of mine.result.cancellations) assert.equal(c.path[0], "soa");
});

test("Statements: another trader gets 403, and a circle never names the traders on it", async () => {
  await addNinthDebt();
  const round = await (await runRoundRoute(house())).json();
  const url = `http://localhost/api/rounds/${round.id}/statement/soa?text=plain`;
  const other = await getStatementRoute(new NextRequest(url, { headers: { "x-alamino-viewer": "hery" } }), {
    params: Promise.resolve({ id: round.id, traderId: "soa" }),
  });
  assert.equal(other.status, 403);
  const res = await getStatementRoute(new NextRequest(url, { headers: { "x-alamino-viewer": "soa" } }), {
    params: Promise.resolve({ id: round.id, traderId: "soa" }),
  });
  assert.equal(res.status, 200);
  const s = await res.json();
  const reasons = s.lines.map((l: { reason: string }) => l.reason).join(" ");
  assert.match(reasons, /circle of \d traders/);
  for (const name of ["Hery", "Rivo", "Lalao", "Fidy"]) assert.ok(!reasons.includes(name));
});

test("Pay-in order and capture: only that trader or the house", async () => {
  await addNinthDebt();
  const round = await (await runRoundRoute(house())).json();
  const params = { params: Promise.resolve({ id: round.id, traderId: "soa" }) };
  assert.equal((await createOrderRoute(as("hery", { method: "POST" }), params)).status, 403);
  const order = await createOrderRoute(as("soa", { method: "POST" }), { params: Promise.resolve({ id: round.id, traderId: "soa" }) });
  assert.equal(order.status, 200);
  const { orderId } = await order.json();
  const body = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) };
  assert.equal((await capturePayinRoute(as("lalao", body), { params: Promise.resolve({ id: round.id, traderId: "soa" }) })).status, 403);
  const captured = await capturePayinRoute(as("soa", body), { params: Promise.resolve({ id: round.id, traderId: "soa" }) });
  assert.equal((await captured.json()).status, "captured");
});
