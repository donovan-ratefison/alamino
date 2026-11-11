export type FinanceSource = "ledger" | "demo" | "sandbox";
export type TransactionStatus = "completed" | "pending" | "failed" | "reversed" | "unknown";
export type TransactionKind = "payment" | "payout" | "refund" | "other";

export interface FinanceTransaction {
  id: string;
  customer: string;
  amountMinor: number;
  amount: number;
  currency: string;
  date: string;
  status: TransactionStatus;
  rawStatus: string;
  method: string;
  kind: TransactionKind;
  source: FinanceSource;
  eventCode?: string;
}

export interface FinanceDebt {
  id: string; debtor: string; creditor: string; amount: number;
  remaining: number; status: string; date: string; currency: "USD";
}

export interface FinanceSnapshot {
  source: FinanceSource;
  transactions: FinanceTransaction[];
  debts: FinanceDebt[];
  start: string;
  end: string;
  syncedAt: string | null;
  warnings: string[];
}

export interface FinanceAccess {
  authenticated: boolean;
  passwordConfigured: boolean;
  paypalConfigured: boolean;
  aiConfigured: boolean;
}
