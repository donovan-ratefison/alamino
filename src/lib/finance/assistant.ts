import { money, totals } from "./metrics.ts";
import type { FinanceSnapshot } from "./types.ts";

export const intents = ["today", "month", "pending", "refunds", "compare", "overview", "dashboard"] as const;
export type FinanceIntent = typeof intents[number];

export function inferIntent(question: string): FinanceIntent {
  const q = question.toLowerCase();
  if (/widget|chart|graph|dashboard|filter|filtr|tableau/.test(q)) return "dashboard";
  if (/refund|rembours/.test(q)) return "refunds";
  if (/pending|attente/.test(q)) return "pending";
  if (/compare|compar|previous|précéd|preced/.test(q)) return "compare";
  if (/today|aujourd/.test(q)) return "today";
  if (/month|mois|chiffre|revenue|revenu/.test(q)) return "month";
  return "overview";
}

export function financialAnswer(snapshot: FinanceSnapshot, intent: FinanceIntent, currency: string, now = new Date()): string {
  const scope = `${{ ledger: "Alamino ledger", demo: "DEMO fixtures", sandbox: "PayPal Sandbox" }[snapshot.source]} · ${currency} · UTC. `;
  const all = snapshot.transactions;
  const t = totals(all, currency);
  const amount = (n: number) => money(n, currency);
  const range = `Loaded period: ${snapshot.start.slice(0, 10)} to ${snapshot.end.slice(0, 10)}. `;
  if (intent === "dashboard") return scope + "I can query the loaded data and edit Studio widgets. Changes affect the dashboard only; they never send money. Without a connected AI model, use Studio’s Edit mode to customise the dashboard.";
  if (intent === "pending") return scope + range + `${t.pending} pending payment records; ${t.failed} failed records. These counts reflect only the available data.`;
  if (intent === "refunds") {
    const refunds = all.filter((r) => r.currency === currency && r.kind === "refund" && r.amountMinor < 0 && r.status === "completed");
    const details = refunds.slice(0, 10).map((r) => `${r.id} · ${r.customer} · ${amount(Math.abs(r.amountMinor))} · ${r.date.slice(0, 10)}`).join("; ");
    return scope + range + `${amount(t.refunded)} in completed outgoing PayPal refunds (${refunds.length} records). Refunds are separate from debt repayments.` + (details ? ` ${details}${refunds.length > 10 ? "; see the transaction explorer for the remaining records." : "."}` : "");
  }
  if (intent === "today" || intent === "month") {
    const from = intent === "today" ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const result = totals(all.filter((r) => Date.parse(r.date) >= +from && Date.parse(r.date) <= +now), currency);
    const incomplete = Date.parse(snapshot.start) > +from || Date.parse(snapshot.end) < +now - 60000;
    return scope + `${amount(result.received)} in completed incoming payments ${intent === "today" ? "today" : "this month"}. ${incomplete ? "The selected date range does not cover this entire period. " : ""}These are clearing-account receipts, not Alamino turnover; no commission revenue is recorded.`;
  }
  if (intent === "compare") {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monday = +day - ((day.getUTCDay() + 6) % 7) * 86400000;
    const duration = +now - monday;
    const previous = monday - 7 * 86400000;
    const received = (a: number, b: number) => totals(all.filter((r) => Date.parse(r.date) >= a && Date.parse(r.date) < b), currency).received;
    const current = received(monday, +now), prior = received(previous, previous + duration);
    return scope + `Incoming payments, week-to-date: ${amount(current)}. Same elapsed period last week: ${amount(prior)}. Difference: ${amount(current - prior)}. ${Date.parse(snapshot.start) > previous || Date.parse(snapshot.end) < +now - 60000 ? "The loaded date range is incomplete for this comparison. " : ""}These are receipts, not commission revenue.`;
  }
  return scope + range + `Received: ${amount(t.received)}. Paid out: ${amount(t.paidOut)}. Refunded: ${amount(t.refunded)}. Net of these payment flows: ${amount(t.net)} (before fees and other account events; not the PayPal balance). Pending: ${t.pending}. No Alamino commission revenue is recorded.`;
}
