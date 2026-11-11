import type { FinanceTransaction } from "./types.ts";

// Explicit fixtures, never PayPal records. Kept separate from the live account cache.
export function demoTransactions(now = new Date()): FinanceTransaction[] {
  const people = ["Soa", "Lalao", "Fidy", "Hery", "Rivo"];
  return Array.from({ length: 36 }, (_, i) => {
    const kind = i % 11 === 0 ? "refund" : i % 5 === 0 ? "payout" : "payment";
    const status = i % 13 === 0 ? "failed" : i % 7 === 0 ? "pending" : "completed";
    const amountMinor = (1700 + (i * 1373) % 18000) * (kind === "payment" ? 1 : -1);
    return { id: `DEMO-${String(i + 1).padStart(4, "0")}`, customer: people[i % people.length],
      amountMinor, amount: amountMinor / 100, currency: "USD", date: new Date(+now - 5 * 60000 - i * 18 * 3600000).toISOString(),
      status, rawStatus: status.toUpperCase(), method: "PayPal (demo)", kind, source: "demo" };
  });
}
