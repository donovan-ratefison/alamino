import { db, getRound, HttpError, listDebts, listTraders } from "../db.ts";
import type { PaymentStatus, Round } from "../types.ts";
import { paypalMode, paypalFetch } from "../paypal/client.ts";
import { demoTransactions } from "./demo.ts";
import { currencyDigits, parseMoney } from "./metrics.ts";
import { reportingTransactions } from "./paypal.ts";
import { readCache, writeCache } from "./store.ts";
import type { FinanceSnapshot, FinanceSource, FinanceTransaction, TransactionStatus } from "./types.ts";

function ledger() {
  const names = new Map(listTraders().map((t) => [t.id, t.name]));
  return listDebts().map((d) => ({ id: d.id, debtor: names.get(d.debtorId) ?? d.debtorId, creditor: names.get(d.creditorId) ?? d.creditorId,
    amount: d.amountCents / 100, remaining: ["settled", "cleared"].includes(d.status) ? 0 : d.remainingCents / 100,
    date: d.createdAt, status: d.status, currency: "USD" as const }));
}

const LEDGER_STATUS: Partial<Record<PaymentStatus, TransactionStatus>> = { captured: "completed", confirmed: "completed", pending: "pending", sent: "pending", failed: "failed" };

// One record per settlement of a clearing round. A pay-in is money received by the
// clearing account, a pay-out is money paid out. Status `none` means no payment yet.
export function roundTransactions(round: Round, names: Map<string, string>): FinanceTransaction[] {
  return round.settlements.flatMap((s) => {
    const status = LEDGER_STATUS[s.status];
    if (!status) return [];
    const payIn = s.direction === "pay_in";
    const amountMinor = payIn ? s.amountCents : -s.amountCents;
    const simulated = (payIn ? s.paypalOrderId : s.paypalPayoutBatchId)?.startsWith("SIM-");
    return [{ id: `${round.id}-${s.traderId}`, customer: names.get(s.traderId) ?? s.traderId, amountMinor, amount: amountMinor / 100,
      currency: "USD", date: round.createdAt, status, rawStatus: s.status, method: `${payIn ? "PayPal Checkout" : "PayPal Payouts"}${simulated ? " (simulated)" : ""}`,
      kind: payIn ? "payment" : "payout", source: "ledger" }];
  });
}

// db.ts has no listRounds helper: read the round ids here and load each round with getRound.
function ledgerTransactions(start: string, end: string): FinanceTransaction[] {
  const names = new Map(listTraders().map((t) => [t.id, t.name]));
  const ids = db().prepare("SELECT id FROM rounds WHERE createdAt >= ? AND createdAt <= ? ORDER BY rowid DESC").all(start, end) as { id: string }[];
  return ids.flatMap(({ id }) => { const round = getRound(id); return round ? roundTransactions(round, names) : []; });
}

interface Order {
  id: string; status?: string; create_time?: string;
  payer?: { name?: { given_name?: string; surname?: string } };
  payment_source?: Record<string, unknown>;
  purchase_units?: { amount?: { value: string; currency_code: string }; payments?: { captures?: { id: string; status: string; create_time?: string; amount: { value: string; currency_code: string } }[] } }[];
}

async function recentOrders(start: string, end: string): Promise<FinanceTransaction[]> {
  const known = db().prepare("SELECT DISTINCT paypalOrderId FROM settlements WHERE paypalOrderId IS NOT NULL AND paypalOrderId NOT LIKE 'SIM-%' LIMIT 50").all() as { paypalOrderId: string }[];
  const rows: FinanceTransaction[] = [];
  for (const { paypalOrderId } of known) {
    if (!/^[A-Za-z0-9]+$/.test(paypalOrderId)) continue;
    const order = await paypalFetch<Order>(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
    const unit = order.purchase_units?.[0];
    const captures = unit?.payments?.captures;
    const values = captures?.length ? captures : [{ id: order.id, status: order.status ?? "UNKNOWN", create_time: order.create_time, amount: unit?.amount }];
    for (const c of values) {
      if (!c.amount || !c.create_time || !Number.isFinite(Date.parse(c.create_time))) continue;
      const date = new Date(c.create_time).toISOString();
      if (date < start || date > end) continue;
      const status: TransactionStatus = c.status === "COMPLETED" ? "completed" : ["DECLINED", "DENIED", "FAILED", "VOIDED"].includes(c.status) ? "failed" : ["REFUNDED", "PARTIALLY_REFUNDED"].includes(c.status) ? "reversed" : "pending";
      const amountMinor = parseMoney(c.amount.value, c.amount.currency_code);
      rows.push({ id: c.id, customer: [order.payer?.name?.given_name, order.payer?.name?.surname].filter(Boolean).join(" ") || "Not provided by PayPal", amountMinor,
        amount: amountMinor / 10 ** currencyDigits(c.amount.currency_code), currency: c.amount.currency_code, date, status, rawStatus: c.status,
        method: Object.keys(order.payment_source ?? {})[0] ?? "Not provided by PayPal", kind: "payment", source: "sandbox" });
    }
  }
  return rows;
}

async function recentPayouts(start: string, end: string): Promise<FinanceTransaction[]> {
  const batches = db().prepare("SELECT DISTINCT paypalPayoutBatchId FROM settlements WHERE paypalPayoutBatchId IS NOT NULL AND paypalPayoutBatchId NOT LIKE 'SIM-%' LIMIT 20").all() as { paypalPayoutBatchId: string }[];
  const rows: FinanceTransaction[] = [];
  for (const { paypalPayoutBatchId: id } of batches) {
    if (!/^[A-Za-z0-9]+$/.test(id)) continue;
    const batch = await paypalFetch<{ items?: { transaction_id?: string; payout_item_id?: string; transaction_status?: string; time_processed?: string;
      payout_item?: { sender_item_id?: string; amount?: { value: string; currency: string } } }[] }>(`/v1/payments/payouts/${encodeURIComponent(id)}?page_size=1000`);
    for (const item of batch.items ?? []) {
      const value = item.payout_item?.amount, date = item.time_processed;
      if (!value || !date || !Number.isFinite(Date.parse(date)) || !item.payout_item_id) continue;
      const iso = new Date(date).toISOString(); if (iso < start || iso > end) continue;
      const amountMinor = -Math.abs(parseMoney(value.value, value.currency));
      rows.push({ id: item.transaction_id ?? item.payout_item_id, customer: listTraders().find((t) => t.id === item.payout_item?.sender_item_id)?.name ?? "PayPal payout recipient",
        amountMinor, amount: amountMinor / 10 ** currencyDigits(value.currency), currency: value.currency, date: iso,
        status: item.transaction_status === "SUCCESS" ? "completed" : ["FAILED", "BLOCKED", "DENIED"].includes(item.transaction_status ?? "") ? "failed" : ["RETURNED", "REFUNDED", "REVERSED"].includes(item.transaction_status ?? "") ? "reversed" : "pending",
        rawStatus: item.transaction_status ?? "UNKNOWN", method: "PayPal Payouts", kind: "payout", source: "sandbox" });
    }
  }
  return rows;
}

export async function financeSnapshot(source: FinanceSource, start: string, end: string, refresh = false): Promise<FinanceSnapshot> {
  const base = { source, start, end, debts: ledger() };
  if (source === "ledger") return { ...base, transactions: ledgerTransactions(start, end), syncedAt: null,
    warnings: ["Payments from the clearing rounds in this app. Debt Tracker shows the app debt ledger."] };
  if (source === "demo") return { ...base, transactions: demoTransactions().filter((t) => t.date >= start && t.date <= end), syncedAt: null,
    warnings: ["Demonstration transactions are generated fixtures, not PayPal payments. Debt Tracker shows the local Alamino demonstration ledger."] };
  if (paypalMode() !== "sandbox") throw new HttpError(503, "Configure PayPal Sandbox credentials on the server first.");
  if (process.env.PAYPAL_BASE_URL && process.env.PAYPAL_BASE_URL !== "https://api-m.sandbox.paypal.com") throw new HttpError(503, "Finance only supports the PayPal Sandbox API.");
  const cached = readCache(start, end);
  if (cached && !refresh && Date.now() - Date.parse(cached.syncedAt) < 60000) return { ...base, ...cached, warnings: ["Cached Sandbox snapshot. Reporting can lag by up to three hours. Debt Tracker is the local demo ledger."] };
  const warnings = ["PayPal reporting may lag by up to three hours. Debt Tracker is the local Alamino demo ledger, not an imported PayPal debt register."];
  const results = await Promise.allSettled([reportingTransactions(start, end), recentOrders(start, end), recentPayouts(start, end)]);
  const report = results[0], orders = results[1], payouts = results[2];
  if (report.status === "rejected") warnings.push("PayPal Transaction Search is unavailable. Check the reporting permission on your Sandbox app. Only retrievable known orders can be shown; history and refunds may be incomplete.");
  if (orders.status === "rejected") warnings.push("Some recent order details could not be retrieved. Reporting remains the available source.");
  if (payouts.status === "rejected") warnings.push("Recent payout details are unavailable; reporting may not yet contain them.");
  if (report.status === "rejected" && orders.status === "rejected" && payouts.status === "rejected") throw new HttpError(502, "PayPal data could not be retrieved. Check Sandbox credentials and reporting permissions.");
  const transactions = report.status === "fulfilled" ? report.value.transactions : [];
  if (report.status === "fulfilled" && report.value.skipped) warnings.push(`${report.value.skipped} provider records were excluded because their required fields could not be validated.`);
  const ids = new Set(transactions.map((t) => t.id));
  if (orders.status === "fulfilled") for (const t of orders.value) if (!ids.has(t.id)) { transactions.push(t); ids.add(t.id); }
  if (payouts.status === "fulfilled") for (const t of payouts.value) if (!ids.has(t.id)) { transactions.push(t); ids.add(t.id); }
  transactions.sort((a, b) => b.date.localeCompare(a.date));
  // Do not mark a partial snapshot as a complete cached import.
  const syncedAt = report.status === "fulfilled" && orders.status === "fulfilled" && payouts.status === "fulfilled" ? writeCache(start, end, transactions) : new Date().toISOString();
  return { ...base, transactions, syncedAt, warnings };
}
