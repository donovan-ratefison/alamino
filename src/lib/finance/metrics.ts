import type { FinanceTransaction } from "./types.ts";

export function currencyDigits(currency: string): number {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid currency");
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

// Parse provider decimal strings without rounding fractional cents into a payment.
export function parseMoney(value: string, currency: string): number {
  const digits = currencyDigits(currency);
  if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error("Invalid monetary value");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  if (fraction.length > digits && /[1-9]/.test(fraction.slice(digits))) throw new Error("Invalid monetary precision");
  const n = Number(whole) * 10 ** digits + Number(fraction.slice(0, digits).padEnd(digits, "0"));
  if (!Number.isSafeInteger(n)) throw new Error("Monetary value out of range");
  return value.startsWith("-") ? -n : n;
}

export function totals(rows: FinanceTransaction[], currency: string) {
  const selected = rows.filter((t) => t.currency === currency);
  const sum = (fn: (t: FinanceTransaction) => boolean) => selected.filter(fn).reduce((n, t) => n + Math.abs(t.amountMinor), 0);
  const received = sum((t) => t.kind === "payment" && t.amountMinor > 0 && t.status === "completed");
  const paidOut = sum((t) => (t.kind === "payout" || t.kind === "payment") && t.amountMinor < 0 && t.status === "completed");
  const refunded = sum((t) => t.kind === "refund" && t.amountMinor < 0 && t.status === "completed");
  return { received, paidOut, refunded, net: received - paidOut - refunded,
    pending: selected.filter((t) => t.status === "pending").length,
    failed: selected.filter((t) => t.status === "failed").length, count: selected.length };
}

export function money(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 10 ** currencyDigits(currency));
}

export function dateRange(start?: string | null, end?: string | null, now = new Date()) {
  const last = end ? new Date(end) : now;
  const first = start ? new Date(start) : new Date(last.getTime() - 30 * 86400000);
  if (!Number.isFinite(+first) || !Number.isFinite(+last) || +first >= +last || +last > +now + 60000 || +last - +first > 93 * 86400000) {
    throw new Error("Choose a valid date range of up to 93 days, ending no later than today.");
  }
  return { start: first.toISOString(), end: last.toISOString() };
}
