import { paypalFetch } from "../paypal/client.ts";
import { currencyDigits, parseMoney } from "./metrics.ts";
import type { FinanceTransaction, TransactionStatus } from "./types.ts";

export interface ReportingRecord {
  transaction_info?: { transaction_id?: string; transaction_event_code?: string; transaction_status?: string;
    transaction_initiation_date?: string; transaction_amount?: { value?: string; currency_code?: string } };
  payer_info?: { email_address?: string; payer_name?: { given_name?: string; surname?: string; alternate_full_name?: string } };
}
export function normalizeReporting(row: ReportingRecord): FinanceTransaction | null {
  const t = row.transaction_info, m = t?.transaction_amount;
  if (!t?.transaction_id || !m?.value || !m.currency_code || !t.transaction_initiation_date || !Number.isFinite(Date.parse(t.transaction_initiation_date))) return null;
  const amountMinor = parseMoney(m.value, m.currency_code);
  const event = t.transaction_event_code ?? "unknown";
  const statuses: Record<string, TransactionStatus> = { S: "completed", P: "pending", D: "failed", V: "reversed" };
  const person = row.payer_info?.payer_name;
  const customer = person?.alternate_full_name || [person?.given_name, person?.surname].filter(Boolean).join(" ") || "Not provided by PayPal";
  return { id: t.transaction_id, customer, amountMinor, amount: amountMinor / 10 ** currencyDigits(m.currency_code),
    currency: m.currency_code, date: new Date(t.transaction_initiation_date).toISOString(), status: statuses[t.transaction_status ?? ""] ?? "unknown",
    rawStatus: t.transaction_status ?? "UNKNOWN", method: "Not provided by reporting API", source: "sandbox", eventCode: event,
    kind: ["T1107", "T1115", "T1120"].includes(event) ? "refund" : event.startsWith("T00") ? "payment" : "other" };
}

// Reporting accepts at most 31 days per request. Never truncate pagination silently.
interface ReportingPage { transaction_details?: ReportingRecord[]; total_pages?: number }
export async function reportingTransactions(start: string, end: string, fetchPage: (path: string) => Promise<ReportingPage> = (path) => paypalFetch<ReportingPage>(path)) {
  const rows: FinanceTransaction[] = []; let skipped = 0;
  for (let at = Date.parse(start); at < Date.parse(end);) {
    const until = Math.min(at + 30 * 86400000, Date.parse(end));
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({ start_date: new Date(at).toISOString(), end_date: new Date(until).toISOString(), fields: "all", balance_affecting_records_only: "Y", page_size: "500", page: String(page) });
      const result = await fetchPage(`/v1/reporting/transactions?${query}`);
      if (!Array.isArray(result.transaction_details)) throw new Error("Invalid PayPal reporting response");
      for (const row of result.transaction_details) {
        try { const normalized = normalizeReporting(row); if (normalized) rows.push(normalized); else skipped++; } catch { skipped++; }
      }
      if (page >= (result.total_pages ?? 1)) break;
      if (page >= 30) throw new Error("Reporting result too large; select a shorter period");
    }
    at = until;
  }
  const unique = new Map(rows.map((r) => [`${r.id}:${r.eventCode}:${r.date}`, r]));
  return { transactions: [...unique.values()], skipped };
}
