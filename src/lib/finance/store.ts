import { createHash } from "node:crypto";
import { db } from "../db.ts";
import type { FinanceTransaction } from "./types.ts";

export const accountScope = () => createHash("sha256").update(`sandbox:${process.env.PAYPAL_CLIENT_ID ?? "unset"}`).digest("hex");
function tables() {
  const conn = db();
  conn.exec(`CREATE TABLE IF NOT EXISTS finance_cache (scope TEXT NOT NULL, rangeKey TEXT NOT NULL, data TEXT NOT NULL, updatedAt TEXT NOT NULL, PRIMARY KEY(scope, rangeKey));
    CREATE TABLE IF NOT EXISTS finance_dashboards (scope TEXT PRIMARY KEY, state TEXT NOT NULL, updatedAt TEXT NOT NULL);`);
  return conn;
}
export function readCache(start: string, end: string) {
  const row = tables().prepare("SELECT data, updatedAt FROM finance_cache WHERE scope = ? AND rangeKey = ?").get(accountScope(), `${start}/${end}`) as { data: string; updatedAt: string } | undefined;
  return row && { transactions: JSON.parse(row.data) as FinanceTransaction[], syncedAt: row.updatedAt };
}
export function writeCache(start: string, end: string, transactions: FinanceTransaction[]) {
  const now = new Date().toISOString();
  tables().prepare("INSERT OR REPLACE INTO finance_cache VALUES (?, ?, ?, ?)").run(accountScope(), `${start}/${end}`, JSON.stringify(transactions), now);
  // Bound cache growth without touching the original debt/settlement tables.
  tables().prepare("DELETE FROM finance_cache WHERE updatedAt < ?").run(new Date(Date.now() - 7 * 86400000).toISOString());
  return now;
}
export function readDashboard(): unknown {
  const row = tables().prepare("SELECT state FROM finance_dashboards WHERE scope = ?").get(accountScope()) as { state: string } | undefined;
  return row ? JSON.parse(row.state) : null;
}
export function writeDashboard(state: object) {
  tables().prepare("INSERT OR REPLACE INTO finance_dashboards VALUES (?, ?, ?)").run(accountScope(), JSON.stringify(state), new Date().toISOString());
}
