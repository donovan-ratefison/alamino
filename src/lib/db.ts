// SQLite access. Other modules use these helpers and do not write SQL.
// Relative imports keep the `.ts` extension so `npm test` can load this file.

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { logActivity, logConfirm, traderName } from "./activity.ts";
import { usd } from "./ai/model.ts";
import { seed } from "./seed.ts";
import type {
  Debt,
  DebtSource,
  DebtStatus,
  Round,
  RoundStatus,
  Settlement,
  Trader,
  TraderId,
} from "./types.ts";

export const DEBT_STATUSES: DebtStatus[] = ["proposed", "disputed", "confirmed", "cleared", "settled", "deferred"];
export const DEBT_SOURCES: DebtSource[] = ["text", "photo", "voice", "seed"];
export const MAX_AMOUNT_CENTS = 10_000_00;

// An error with an HTTP status. Routes turn it into `{ error }`.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
}

// Unique across resets: PayPal `sender_batch_id` must not repeat.
export const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS traders (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, business TEXT NOT NULL,
  aliases TEXT NOT NULL, paypalEmail TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY, debtorId TEXT NOT NULL, creditorId TEXT NOT NULL,
  amountCents INTEGER NOT NULL, remainingCents INTEGER NOT NULL, note TEXT NOT NULL,
  source TEXT NOT NULL, status TEXT NOT NULL, debtorOk INTEGER NOT NULL, creditorOk INTEGER NOT NULL,
  counterAmountCents INTEGER, counterBy TEXT, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY, status TEXT NOT NULL, createdAt TEXT NOT NULL,
  debtsBefore TEXT NOT NULL, result TEXT NOT NULL, debtChanges TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settlements (
  roundId TEXT NOT NULL, traderId TEXT NOT NULL, direction TEXT NOT NULL,
  amountCents INTEGER NOT NULL, status TEXT NOT NULL,
  paypalOrderId TEXT, paypalPayoutItemId TEXT, paypalPayoutBatchId TEXT,
  PRIMARY KEY (roundId, traderId)
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL,
  text TEXT NOT NULL, amountCents INTEGER, debtId TEXT, roundId TEXT
);
`;

// One connection per process, kept on globalThis so hot reload does not open more.
const g = globalThis as unknown as { alaminoDb?: Database.Database };

export function db(): Database.Database {
  if (!g.alaminoDb) {
    const file = process.env.DATABASE_PATH ?? "./data/app.db";
    mkdirSync(dirname(file), { recursive: true });
    const conn = new Database(file);
    conn.pragma("journal_mode = WAL");
    conn.exec(SCHEMA);
    g.alaminoDb = conn;
    const { n } = conn.prepare("SELECT COUNT(*) AS n FROM traders").get() as { n: number };
    if (n === 0) seed();
  }
  return g.alaminoDb;
}

type Row = Record<string, unknown>;

// SQLite has no undefined and no boolean.
const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

// ---- Traders ----

export function insertTrader(t: Trader): void {
  db()
    .prepare("INSERT INTO traders VALUES (@id, @name, @business, @aliases, @paypalEmail)")
    .run({ ...t, aliases: JSON.stringify(t.aliases) });
}

export function listTraders(): Trader[] {
  return (db().prepare("SELECT * FROM traders ORDER BY rowid").all() as Row[]).map((r) => ({
    ...(r as unknown as Trader),
    aliases: JSON.parse(r.aliases as string),
  }));
}

// A new name the capture matches to this trader. Names and aliases are unique across traders.
export function addAlias(traderId: TraderId, alias: string): Trader {
  const name = alias.trim();
  if (name.length < 2 || name.length > 40) throw new HttpError(400, "alias must be 2 to 40 characters");
  return db().transaction(() => {
    const traders = listTraders();
    const t = traders.find((x) => x.id === traderId);
    if (!t) throw new HttpError(404, `No trader ${traderId}`);
    const taken = (x: Trader) => [x.name, ...x.aliases].some((n) => n.toLowerCase() === name.toLowerCase());
    if (traders.some(taken)) throw new HttpError(409, `"${name}" is already the name of a trader`);
    const aliases = [...t.aliases, name];
    db().prepare("UPDATE traders SET aliases = ? WHERE id = ?").run(JSON.stringify(aliases), traderId);
    return { ...t, aliases };
  })();
}

// ---- Debts ----

function toDebt(r: Row): Debt {
  return {
    ...(r as unknown as Debt),
    debtorOk: r.debtorOk === 1,
    creditorOk: r.creditorOk === 1,
    counterAmountCents: opt(r.counterAmountCents as number | null),
    counterBy: opt(r.counterBy as string | null),
  };
}

export function listDebts(status?: DebtStatus): Debt[] {
  const rows = status
    ? db().prepare("SELECT * FROM debts WHERE status = ? ORDER BY createdAt DESC, rowid DESC").all(status)
    : db().prepare("SELECT * FROM debts ORDER BY createdAt DESC, rowid DESC").all();
  return (rows as Row[]).map(toDebt);
}

export function getDebt(id: string): Debt | undefined {
  const r = db().prepare("SELECT * FROM debts WHERE id = ?").get(id) as Row | undefined;
  return r && toDebt(r);
}

function saveDebt(d: Debt): Debt {
  db()
    .prepare(
      `INSERT OR REPLACE INTO debts VALUES (@id, @debtorId, @creditorId, @amountCents, @remainingCents,
       @note, @source, @status, @debtorOk, @creditorOk, @counterAmountCents, @counterBy, @createdAt)`,
    )
    .run({
      ...d,
      debtorOk: d.debtorOk ? 1 : 0,
      creditorOk: d.creditorOk ? 1 : 0,
      counterAmountCents: d.counterAmountCents ?? null,
      counterBy: d.counterBy ?? null,
    });
  return d;
}

export function insertDebt(d: Debt): Debt {
  if (getDebt(d.id)) throw new HttpError(409, `Debt ${d.id} already exists`);
  return saveDebt(d);
}

// Set a key to undefined in `patch` to clear an optional field.
export function updateDebt(id: string, patch: Partial<Debt>): Debt {
  const d = getDebt(id);
  if (!d) throw new HttpError(404, `No debt ${id}`);
  return saveDebt({ ...d, ...patch, id });
}

// Confirm rules, see docs/ARCHITECTURE.md section 7. Logs the change in the activity log.
export function confirmDebt(id: string, traderId: TraderId, ok: boolean, counterAmountCents?: number): Debt {
  return db().transaction(() => {
    const before = getDebt(id);
    const after = applyConfirm(id, traderId, ok, counterAmountCents);
    logConfirm(before!, after, traderId, ok);
    return after;
  })();
}

function applyConfirm(id: string, traderId: TraderId, ok: boolean, counterAmountCents?: number): Debt {
  const d = getDebt(id);
  if (!d) throw new HttpError(404, `No debt ${id}`);
  if (d.status !== "proposed" && d.status !== "disputed") {
    throw new HttpError(409, `Debt ${id} is ${d.status}, it cannot be confirmed`);
  }
  if (traderId !== d.debtorId && traderId !== d.creditorId) {
    throw new HttpError(400, "traderId must be the debtor or the creditor");
  }
  if (counterAmountCents !== undefined && !validAmount(counterAmountCents)) {
    throw new HttpError(400, `counterAmountCents must be an integer from 1 to ${MAX_AMOUNT_CENTS}`);
  }
  const isDebtor = traderId === d.debtorId;
  const side = isDebtor ? "debtorOk" : "creditorOk";
  const other = isDebtor ? "creditorOk" : "debtorOk";
  const noCounter = { counterAmountCents: undefined, counterBy: undefined };

  if (!ok) {
    if (counterAmountCents === undefined) throw new HttpError(400, "counterAmountCents is required when ok is false");
    return updateDebt(id, { status: "disputed", [side]: false, counterAmountCents, counterBy: traderId });
  }
  if (counterAmountCents === undefined) {
    const both = d[other];
    return updateDebt(id, { [side]: true, ...(both ? { status: "confirmed", ...noCounter } : {}) });
  }
  const otherOk = d.counterBy !== undefined && d.counterBy !== traderId && d.counterAmountCents === counterAmountCents;
  return updateDebt(id, {
    amountCents: counterAmountCents,
    remainingCents: counterAmountCents,
    [side]: true,
    [other]: otherOk,
    status: otherOk ? "confirmed" : "proposed",
    ...noCounter,
  });
}

export const validAmount = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n > 0 && n <= MAX_AMOUNT_CENTS;

// ---- Rounds and settlements ----

function settlementsOf(roundId: string): Settlement[] {
  return (db().prepare("SELECT * FROM settlements WHERE roundId = ? ORDER BY rowid").all(roundId) as Row[]).map(
    (r) => {
      const s: Settlement = {
        traderId: r.traderId as string,
        direction: r.direction as Settlement["direction"],
        amountCents: r.amountCents as number,
        status: r.status as Settlement["status"],
      };
      for (const k of ["paypalOrderId", "paypalPayoutItemId", "paypalPayoutBatchId"] as const) {
        if (r[k] !== null) s[k] = r[k] as string;
      }
      return s;
    },
  );
}

function toRound(r: Row): Round {
  return {
    id: r.id as string,
    status: r.status as RoundStatus,
    createdAt: r.createdAt as string,
    debtsBefore: JSON.parse(r.debtsBefore as string),
    result: JSON.parse(r.result as string),
    settlements: settlementsOf(r.id as string),
    debtChanges: JSON.parse(r.debtChanges as string),
  };
}

export function getRound(id: string): Round | undefined {
  const r = db().prepare("SELECT * FROM rounds WHERE id = ?").get(id) as Row | undefined;
  return r && toRound(r);
}

export function latestRound(): Round | undefined {
  const r = db().prepare("SELECT * FROM rounds ORDER BY rowid DESC LIMIT 1").get() as Row | undefined;
  return r && toRound(r);
}

function saveSettlement(roundId: string, s: Settlement): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO settlements VALUES (@roundId, @traderId, @direction, @amountCents, @status,
       @paypalOrderId, @paypalPayoutItemId, @paypalPayoutBatchId)`,
    )
    .run({
      roundId,
      traderId: s.traderId,
      direction: s.direction,
      amountCents: s.amountCents,
      status: s.status,
      paypalOrderId: s.paypalOrderId ?? null,
      paypalPayoutItemId: s.paypalPayoutItemId ?? null,
      paypalPayoutBatchId: s.paypalPayoutBatchId ?? null,
    });
}

export function insertRound(round: Round): Round {
  db().transaction(() => {
    db()
      .prepare("INSERT INTO rounds VALUES (@id, @status, @createdAt, @debtsBefore, @result, @debtChanges)")
      .run({
        id: round.id,
        status: round.status,
        createdAt: round.createdAt,
        debtsBefore: JSON.stringify(round.debtsBefore),
        result: JSON.stringify(round.result),
        debtChanges: JSON.stringify(round.debtChanges),
      });
    for (const s of round.settlements) saveSettlement(round.id, s);
  })();
  return getRound(round.id)!;
}

export function setRoundStatus(roundId: string, status: RoundStatus): Round {
  const { changes } = db().prepare("UPDATE rounds SET status = ? WHERE id = ?").run(status, roundId);
  if (changes === 0) throw new HttpError(404, `No round ${roundId}`);
  return getRound(roundId)!;
}

// Also moves the round from `cleared` to `collecting` when a pay-in becomes `captured`, and logs the capture.
export function updateSettlement(roundId: string, traderId: TraderId, patch: Partial<Settlement>): Round {
  return db().transaction(() => {
    const round = getRound(roundId);
    if (!round) throw new HttpError(404, `No round ${roundId}`);
    const s = round.settlements.find((x) => x.traderId === traderId);
    if (!s) throw new HttpError(404, `No settlement for ${traderId} in round ${roundId}`);
    const next = { ...s, ...patch, traderId };
    saveSettlement(roundId, next);
    if (next.direction === "pay_in" && next.status === "captured" && s.status !== "captured") {
      const all = round.settlements.every((x) => x.direction !== "pay_in" || x.traderId === traderId || x.status === "captured");
      logActivity({
        kind: "payin_captured",
        actor: traderId,
        text: `${traderName(traderId)} paid ${usd(next.amountCents)} through PayPal.${all ? " All pay-ins captured." : ""}`,
        amountCents: next.amountCents,
        roundId,
      });
    }
    if (next.direction === "pay_in" && next.status === "captured" && round.status === "cleared") {
      return setRoundStatus(roundId, "collecting");
    }
    return getRound(roundId)!;
  })();
}
