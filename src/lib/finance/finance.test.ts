import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { currencyDigits, dateRange, parseMoney, totals } from "./metrics.ts";
import { demoTransactions } from "./demo.ts";
import { financialAnswer } from "./assistant.ts";
import { normalizeReporting, reportingTransactions } from "./paypal.ts";
import type { PaymentStatus, Round } from "../types.ts";
import { authenticated, configured, readBody, requireAdmin, sameOrigin, sessionCookie } from "./auth.ts";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "alamino-finance-")), "test.db");
const { readDashboard, writeDashboard } = await import("./store.ts");
const { financeSnapshot, roundTransactions } = await import("./service.ts");
const now = new Date("2026-11-11T12:00:00Z");

test("money preserves signed minor units and currency precision", () => {
  assert.equal(parseMoney("123.45", "USD"), 12345);
  assert.equal(parseMoney("-12.01", "EUR"), -1201);
  assert.equal(currencyDigits("JPY"), 0);
  assert.equal(parseMoney("100", "JPY"), 100);
  assert.throws(() => parseMoney("10.001", "USD"));
  assert.throws(() => parseMoney("NaN", "USD"));
  assert.throws(() => parseMoney("900719925474099100", "USD"));
});
test("financial totals exclude pending payments, refunds from receipts, other events and other currencies", () => {
  const base = demoTransactions(now)[1];
  const rows = [
    { ...base, kind: "payment" as const, status: "completed" as const, amountMinor: 10000 },
    { ...base, kind: "payment" as const, status: "pending" as const, amountMinor: 99999 },
    { ...base, kind: "refund" as const, status: "completed" as const, amountMinor: -2000 },
    { ...base, kind: "payout" as const, status: "completed" as const, amountMinor: -3000 },
    { ...base, kind: "other" as const, status: "completed" as const, amountMinor: 50000 },
    { ...base, kind: "payment" as const, status: "completed" as const, amountMinor: 90000, currency: "EUR" },
  ];
  assert.deepEqual(totals(rows, "USD"), { received: 10000, paidOut: 3000, refunded: 2000, net: 5000, pending: 1, failed: 0, count: 5 });
});
test("reporting preserves provider statuses and marks refund events without inventing payment methods", () => {
  const row = normalizeReporting({ transaction_info: { transaction_id: "TX1", transaction_event_code: "T1107", transaction_status: "S", transaction_initiation_date: now.toISOString(), transaction_amount: { value: "-12.50", currency_code: "USD" } } });
  assert.equal(row?.kind, "refund"); assert.equal(row?.status, "completed"); assert.equal(row?.amountMinor, -1250);
  assert.equal(row?.method, "Not provided by reporting API"); assert.equal(row?.source, "sandbox");
  assert.equal(normalizeReporting({ transaction_info: { transaction_id: "broken" } }), null);
});
test("reporting paginates and divides date ranges, deduplicating boundary records", async () => {
  const paths: string[] = [];
  const result = await reportingTransactions("2026-09-01T00:00:00Z", "2026-11-01T00:00:00Z", async (path) => {
    paths.push(path);
    const query = new URL(`http://test${path}`).searchParams;
    assert.ok(Date.parse(query.get("end_date")!) - Date.parse(query.get("start_date")!) <= 31 * 86400000);
    return { total_pages: 2, transaction_details: [{ transaction_info: { transaction_id: "boundary", transaction_event_code: "T0006", transaction_status: "S", transaction_initiation_date: now.toISOString(), transaction_amount: { value: "1.00", currency_code: "USD" } } }] };
  });
  assert.equal(paths.length, 6); assert.equal(result.transactions.length, 1);
});
test("invalid date ranges are rejected rather than queried", () => {
  assert.throws(() => dateRange("wrong", null, now));
  assert.throws(() => dateRange("2026-01-01", "2026-11-01", now));
  assert.throws(() => dateRange("2026-11-12", "2026-11-13", now));
});
test("admin session rejects missing, modified and expired cookies and cross-origin requests", () => {
  process.env.FINANCE_ADMIN_PASSWORD = "finance-test-password-with-entropy";
  assert.ok(configured());
  const req = new Request("https://example.test/api/finance/session");
  const cookie = sessionCookie(req).split(";")[0];
  assert.equal(authenticated(new Request(req, { headers: { cookie } })), true);
  assert.equal(authenticated(new Request(req, { headers: { cookie: `${cookie}x` } })), false);
  assert.equal(authenticated(new Request(req, { headers: { cookie: cookie.replace(/=\d+/, "=1") } })), false);
  assert.throws(() => requireAdmin(req));
  assert.throws(() => sameOrigin(new Request(req, { headers: { origin: "https://evil.test" } })));
  assert.doesNotThrow(() => sameOrigin(new Request(req, { headers: { origin: "https://example.test" } })));
  delete process.env.FINANCE_ADMIN_PASSWORD;
});
test("request validation enforces a body size limit and JSON object shape", async () => {
  await assert.rejects(readBody(new Request("https://test", { method: "POST", body: JSON.stringify({ large: "x".repeat(100) }) }), 30));
  await assert.rejects(readBody(new Request("https://test", { method: "POST", body: "[]" })));
});
test("saved dashboards are scoped to the configured Sandbox app", () => {
  process.env.PAYPAL_CLIENT_ID = "finance-app-a"; writeDashboard({ pages: [{ id: "saved" }] });
  assert.deepEqual(readDashboard(), { pages: [{ id: "saved" }] });
  process.env.PAYPAL_CLIENT_ID = "finance-app-b"; assert.equal(readDashboard(), null);
  delete process.env.PAYPAL_CLIENT_ID;
});
test("demo snapshot is explicitly labelled and missing Sandbox keys never silently become demo data", async () => {
  const result = await financeSnapshot("demo", "2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z");
  assert.equal(result.source, "demo"); assert.equal(result.syncedAt, null);
  assert.ok(result.transactions.every((r) => r.source === "demo" && r.id.startsWith("DEMO-")));
  assert.ok(result.warnings[0].includes("not PayPal payments"));
  delete process.env.PAYPAL_CLIENT_SECRET; delete process.env.PAYPAL_CLIENT_ID;
  await assert.rejects(financeSnapshot("sandbox", result.start, result.end), /Configure PayPal/);
});
test("assistant uses server totals, UTC periods and warns when comparison coverage is incomplete", () => {
  const snapshot = { source: "demo" as const, transactions: demoTransactions(now), debts: [], start: "2026-11-10T00:00:00Z", end: now.toISOString(), syncedAt: null, warnings: [] };
  assert.match(financialAnswer(snapshot, "month", "USD", now), /not Alamino turnover/);
  assert.match(financialAnswer(snapshot, "compare", "USD", now), /incomplete/);
  assert.match(financialAnswer(snapshot, "overview", "USD", now), /DEMO fixtures/);
});

test("same-origin check accepts the host the browser used behind a proxy or on a network address", () => {
  const internal = "http://localhost:10000/api/finance/session";
  const viaProxy = (origin: string, headers: Record<string, string>) => new Request(internal, { method: "POST", headers: { origin, ...headers } });
  assert.doesNotThrow(() => sameOrigin(viaProxy("https://alamino.example", { host: "alamino.example", "x-forwarded-proto": "https" })));
  assert.doesNotThrow(() => sameOrigin(viaProxy("https://alamino.example", { "x-forwarded-host": "alamino.example" })));
  assert.doesNotThrow(() => sameOrigin(viaProxy("http://192.168.1.20:3000", { host: "192.168.1.20:3000" })));
  assert.throws(() => sameOrigin(viaProxy("https://evil.test", { host: "alamino.example" })));
  assert.throws(() => sameOrigin(viaProxy("not a url", { host: "alamino.example" })));
  assert.throws(() => sameOrigin(new Request(internal, { method: "POST", headers: { host: "alamino.example" } })));
  assert.match(sessionCookie(viaProxy("https://alamino.example", { host: "alamino.example", "x-forwarded-proto": "https" })), /; Secure/);
});

test("ledger maps each round settlement to one record and the KPIs follow the money rules", () => {
  const settle = (traderId: string, direction: "pay_in" | "pay_out", amountCents: number, status: PaymentStatus) => ({ traderId, direction, amountCents, status });
  const round = { id: "round-1", status: "paying", createdAt: now.toISOString(), debtsBefore: [], debtChanges: [], result: {} as Round["result"],
    settlements: [settle("hery", "pay_in", 12000, "captured"), settle("soa", "pay_in", 8000, "captured"), settle("rivo", "pay_in", 5000, "captured"),
      settle("lalao", "pay_out", 15000, "sent"), settle("fidy", "pay_out", 10000, "sent"), settle("x", "pay_out", 100, "none")] } as Round;
  const rows = roundTransactions(round, new Map([["hery", "Hery"], ["lalao", "Lalao"]]));
  assert.equal(rows.length, 5);
  const received = rows.filter((r) => r.kind === "payment");
  assert.ok(received.length === 3 && received.every((r) => r.status === "completed" && r.amountMinor > 0));
  const paidOut = rows.filter((r) => r.kind === "payout");
  assert.ok(paidOut.length === 2 && paidOut.every((r) => r.status === "pending" && r.amountMinor < 0));
  assert.equal(rows[0].customer, "Hery"); assert.equal(rows[0].date, round.createdAt); assert.equal(rows[0].source, "ledger"); assert.equal(rows[0].currency, "USD");
  assert.deepEqual(totals(rows, "USD"), { received: 25000, paidOut: 0, refunded: 0, net: 25000, pending: 2, failed: 0, count: 5 });
});
test("ledger source is empty when no clearing round exists", async () => {
  const result = await financeSnapshot("ledger", "2026-11-01T00:00:00Z", now.toISOString());
  assert.equal(result.source, "ledger"); assert.deepEqual(result.transactions, []);
});
