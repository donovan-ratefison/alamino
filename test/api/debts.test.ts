import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "alamino-api-debts-")), "test.db");

const { reset } = await import("@/lib/seed");
const { listDebts } = await import("@/lib/db");
const { NextRequest } = await import("next/server");

const { GET: getDebts, POST: postDebt } = await import("@/app/api/debts/route");
const { POST: confirmDebtRoute } = await import("@/app/api/debts/[id]/confirm/route");
const { POST: resolveDebtRoute } = await import("@/app/api/debts/[id]/resolve/route");

beforeEach(() => {
  reset();
});

test("GET /api/debts lists debts and filters by status", async () => {
  // All debts
  const allReq = new NextRequest("http://localhost/api/debts");
  const allRes = await getDebts(allReq);
  assert.equal(allRes.status, 200);
  const allDebts = await allRes.json();
  assert.equal(allDebts.length, 8);

  // Filter confirmed
  const confReq = new NextRequest("http://localhost/api/debts?status=confirmed");
  const confRes = await getDebts(confReq);
  assert.equal(confRes.status, 200);
  const confDebts = await confRes.json();
  assert.equal(confDebts.length, 8);
  assert.ok(confDebts.every((d: { status: string }) => d.status === "confirmed"));

  // Filter proposed
  const propReq = new NextRequest("http://localhost/api/debts?status=proposed");
  const propRes = await getDebts(propReq);
  assert.equal(propRes.status, 200);
  const propDebts = await propRes.json();
  assert.equal(propDebts.length, 0);

  // Invalid status
  const badReq = new NextRequest("http://localhost/api/debts?status=invalid_status");
  const badRes = await getDebts(badReq);
  assert.equal(badRes.status, 400);
  const badJson = await badRes.json();
  assert.ok(badJson.error.includes("status must be one of"));
});

test("POST /api/debts creates proposed debts with appropriate side approvals", async () => {
  // Created by debtor (rivo owes hery $50)
  const reqByDebtor = new Request("http://localhost/api/debts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      debtorId: "rivo",
      creditorId: "hery",
      amountCents: 5000,
      note: "beef wholesale",
      source: "text",
      createdBy: "rivo",
    }),
  });
  const res1 = await postDebt(reqByDebtor);
  assert.equal(res1.status, 201);
  const debt1 = await res1.json();
  assert.equal(debt1.debtorId, "rivo");
  assert.equal(debt1.creditorId, "hery");
  assert.equal(debt1.amountCents, 5000);
  assert.equal(debt1.remainingCents, 5000);
  assert.equal(debt1.note, "beef wholesale");
  assert.equal(debt1.status, "proposed");
  assert.equal(debt1.debtorOk, true);
  assert.equal(debt1.creditorOk, false);

  // Created by creditor (fidy owes lalao $20, created by lalao)
  const reqByCreditor = new Request("http://localhost/api/debts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      debtorId: "fidy",
      creditorId: "lalao",
      amountCents: 2000,
      note: "carrots",
      source: "voice",
      createdBy: "lalao",
    }),
  });
  const res2 = await postDebt(reqByCreditor);
  assert.equal(res2.status, 201);
  const debt2 = await res2.json();
  assert.equal(debt2.debtorOk, false);
  assert.equal(debt2.creditorOk, true);
});

test("POST /api/debts validates body fields, traders, and amount bounds", async () => {
  // Missing JSON
  const r1 = await postDebt(new Request("http://localhost/api/debts", { method: "POST", body: "bad" }));
  assert.equal(r1.status, 400);

  // Missing debtorId / creditorId
  const r2 = await postDebt(
    new Request("http://localhost/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: 5000, createdBy: "rivo" }),
    }),
  );
  assert.equal(r2.status, 400);

  // Unknown trader ID
  const r3 = await postDebt(
    new Request("http://localhost/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debtorId: "unknown", creditorId: "hery", amountCents: 5000, source: "text", createdBy: "hery" }),
    }),
  );
  assert.equal(r3.status, 404);

  // Trader owes themselves
  const r4 = await postDebt(
    new Request("http://localhost/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debtorId: "hery", creditorId: "hery", amountCents: 5000, source: "text", createdBy: "hery" }),
    }),
  );
  assert.equal(r4.status, 400);

  // Invalid amount (0, negative, fractional, or over maximum)
  for (const badAmount of [0, -100, 1.5, 20_000_000]) {
    const res = await postDebt(
      new Request("http://localhost/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debtorId: "rivo", creditorId: "hery", amountCents: badAmount, source: "text", createdBy: "rivo" }),
      }),
    );
    assert.equal(res.status, 400);
  }

  // Note too long (> 200 chars)
  const r5 = await postDebt(
    new Request("http://localhost/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debtorId: "rivo", creditorId: "hery", amountCents: 5000, note: "x".repeat(201), source: "text", createdBy: "rivo" }),
    }),
  );
  assert.equal(r5.status, 400);

  // Invalid source
  const r6 = await postDebt(
    new Request("http://localhost/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debtorId: "rivo", creditorId: "hery", amountCents: 5000, source: "blockchain", createdBy: "rivo" }),
    }),
  );
  assert.equal(r6.status, 400);

  // createdBy is neither debtor nor creditor
  const r7 = await postDebt(
    new Request("http://localhost/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debtorId: "rivo", creditorId: "hery", amountCents: 5000, source: "text", createdBy: "soa" }),
    }),
  );
  assert.equal(r7.status, 400);
});

test("POST /api/debts/[id]/confirm approves and confirms proposed debts", async () => {
  // Propose a debt from rivo to hery
  const postRes = await postDebt(
    new Request("http://localhost/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debtorId: "rivo", creditorId: "hery", amountCents: 5000, source: "text", createdBy: "rivo" }),
    }),
  );
  const debt = await postRes.json();

  // Invalid body (missing ok)
  const badReq = new Request(`http://localhost/api/debts/${debt.id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traderId: "hery" }),
  });
  const badRes = await confirmDebtRoute(badReq, { params: Promise.resolve({ id: debt.id }) });
  assert.equal(badRes.status, 400);

  // 400 if uninvolved trader tries to confirm
  const wrongTraderReq = new Request(`http://localhost/api/debts/${debt.id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traderId: "soa", ok: true }),
  });
  const wrongTraderRes = await confirmDebtRoute(wrongTraderReq, { params: Promise.resolve({ id: debt.id }) });
  assert.equal(wrongTraderRes.status, 400);

  // Counterparty approves -> confirmed
  const approveReq = new Request(`http://localhost/api/debts/${debt.id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traderId: "hery", ok: true }),
  });
  const approveRes = await confirmDebtRoute(approveReq, { params: Promise.resolve({ id: debt.id }) });
  assert.equal(approveRes.status, 200);
  const confirmedDebt = await approveRes.json();
  assert.equal(confirmedDebt.status, "confirmed");
  assert.equal(confirmedDebt.creditorOk, true);

  // Once confirmed, confirming again throws 409
  const reConfirmReq = new Request(`http://localhost/api/debts/${debt.id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traderId: "hery", ok: true }),
  });
  const reConfirmRes = await confirmDebtRoute(reConfirmReq, { params: Promise.resolve({ id: debt.id }) });
  assert.equal(reConfirmRes.status, 409);
});

test("POST /api/debts/[id]/confirm disputes debt with counter amount and accepts counter amount", async () => {
  const postRes = await postDebt(
    new Request("http://localhost/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debtorId: "rivo", creditorId: "hery", amountCents: 5000, source: "text", createdBy: "rivo" }),
    }),
  );
  const debt = await postRes.json();

  // Hery disputes with counterAmountCents = 6000
  const disputeReq = new Request(`http://localhost/api/debts/${debt.id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traderId: "hery", ok: false, counterAmountCents: 6000 }),
  });
  const disputeRes = await confirmDebtRoute(disputeReq, { params: Promise.resolve({ id: debt.id }) });
  assert.equal(disputeRes.status, 200);
  const disputedDebt = await disputeRes.json();
  assert.equal(disputedDebt.status, "disputed");
  assert.equal(disputedDebt.counterAmountCents, 6000);
  assert.equal(disputedDebt.counterBy, "hery");

  // Rivo accepts counter amount -> confirmed at 6000
  const acceptCounterReq = new Request(`http://localhost/api/debts/${debt.id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traderId: "rivo", ok: true, counterAmountCents: 6000 }),
  });
  const acceptRes = await confirmDebtRoute(acceptCounterReq, { params: Promise.resolve({ id: debt.id }) });
  assert.equal(acceptRes.status, 200);
  const finalDebt = await acceptRes.json();
  assert.equal(finalDebt.status, "confirmed");
  assert.equal(finalDebt.amountCents, 6000);
  assert.equal(finalDebt.remainingCents, 6000);
});

test("POST /api/debts/[id]/resolve provides resolution suggestions for disputed debts", async () => {
  // Unknown debt -> 404
  const res404 = await resolveDebtRoute(new Request("http://localhost"), { params: Promise.resolve({ id: "unknown_debt_id" }) });
  assert.equal(res404.status, 404);

  // Undisputed debt -> 409
  const seedDebt = listDebts()[0];
  const res409 = await resolveDebtRoute(new Request("http://localhost"), { params: Promise.resolve({ id: seedDebt.id }) });
  assert.equal(res409.status, 409);

  // Disputed debt
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
      body: JSON.stringify({ traderId: "hery", ok: false, counterAmountCents: 6000 }),
    }),
    { params: Promise.resolve({ id: debt.id }) },
  );

  const resolveRes = await resolveDebtRoute(new Request("http://localhost"), { params: Promise.resolve({ id: debt.id }) });
  assert.equal(resolveRes.status, 200);
  const resolution = await resolveRes.json();
  assert.equal(typeof resolution.suggestion, "string");
  assert.ok(resolution.suggestion.length > 0);
  assert.ok(resolution.proposedAmountCents === null || [5000, 6000].includes(resolution.proposedAmountCents));
});
