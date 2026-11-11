// Shared contract. Every module codes against these types.
// Change this file with care: the API, the screens and the tests depend on it.
// All money is integer cents in USD (PayPal does not support MGA).

export type TraderId = string;

export interface Trader {
  id: TraderId;
  name: string; // "Hery"
  business: string; // "Rice wholesale"
  aliases: string[]; // other names the AI should match to this trader
  paypalEmail: string; // sandbox personal account
}

export type DebtStatus =
  | "proposed" // captured, waiting for both sides
  | "disputed" // the two sides gave different amounts
  | "confirmed" // both approved, enters the next round
  | "cleared" // fully cancelled inside a circle, no money moved
  | "settled" // remainder paid through the clearing account
  | "deferred"; // rolled to the next round after a shortfall

export type DebtSource = "text" | "photo" | "voice" | "seed";

export interface Debt {
  id: string;
  debtorId: TraderId; // owes the money
  creditorId: TraderId; // is owed the money
  amountCents: number; // original amount
  remainingCents: number; // what is left after circles are cancelled
  note: string; // "rice for the restaurant, week 45"
  source: DebtSource;
  status: DebtStatus;
  debtorOk: boolean;
  creditorOk: boolean;
  counterAmountCents?: number; // amount claimed by the side that disagrees
  counterBy?: TraderId; // who claimed counterAmountCents
  createdAt: string; // ISO
}

// What the AI returns from /api/capture. Nothing is saved until a user accepts it.
export interface DebtDraft {
  debtorId: TraderId | null; // null = the AI could not match a trader
  creditorId: TraderId | null;
  debtorText: string; // the name as written or spoken
  creditorText: string;
  amountCents: number | null;
  note: string;
  confidence: "high" | "medium" | "low";
  question?: string; // what the AI needs to ask before this can be saved
}

// ---- Netting engine (pure functions, no I/O) ----

export interface Edge {
  debtorId: TraderId;
  creditorId: TraderId;
  amountCents: number;
}

export interface Cancellation {
  path: TraderId[]; // [a, b, c] means a owes b, b owes c, c owes a
  amountCents: number; // amount removed from every debt on the circle
}

export interface Position {
  traderId: TraderId;
  netCents: number; // positive = is owed money, negative = owes money
}

export interface ClearingStats {
  grossCents: number; // total of all confirmed debts
  clearedByCirclesCents: number; // debt removed with no money moving
  remainingCents: number; // debt left after circles
  cashMovedCents: number; // total paid into the clearing account
  savedPct: number; // 1 - cashMoved / gross, as 0..100
}

export interface ClearingResult {
  cancellations: Cancellation[];
  remaining: Edge[]; // one edge per pair, after circles
  positions: Position[];
  payIns: { traderId: TraderId; amountCents: number }[];
  payOuts: { traderId: TraderId; amountCents: number }[];
  stats: ClearingStats;
}

// ---- Rounds and settlement ----

export type RoundStatus =
  | "cleared" // netting done, waiting for pay-ins
  | "collecting" // some pay-ins captured
  | "paying" // all pay-ins captured, payouts sent
  | "done" // payouts confirmed
  | "shortfall"; // a pay-in is missing, needs a decision

export type PaymentStatus = "none" | "pending" | "captured" | "sent" | "confirmed" | "failed";

export interface Settlement {
  traderId: TraderId;
  direction: "pay_in" | "pay_out";
  amountCents: number;
  status: PaymentStatus;
  paypalOrderId?: string; // pay-ins
  paypalPayoutItemId?: string; // pay-outs
  paypalPayoutBatchId?: string; // pay-outs, needed to poll the batch
}

export interface Round {
  id: string;
  status: RoundStatus;
  createdAt: string;
  debtsBefore: Edge[]; // snapshot for the "before" picture
  result: ClearingResult;
  settlements: Settlement[];
  debtChanges: DebtChange[]; // what the round did to each debt, for statements
}

export interface DebtChange {
  debtId: string;
  beforeCents: number; // remainingCents before the round
  afterCents: number; // remainingCents after circles were cancelled
}

export interface Statement {
  traderId: TraderId;
  roundId: string;
  summary: string; // AI text, two or three plain sentences
  lines: {
    debtId: string;
    counterparty: string;
    direction: "you_owe" | "owed_to_you";
    beforeCents: number;
    afterCents: number;
    reason: string; // AI text, one sentence
  }[];
  netCents: number;
  action: "pay_in" | "receive" | "nothing";
}
