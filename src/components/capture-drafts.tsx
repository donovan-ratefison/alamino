"use client";

import type { Debt, DebtDraft, DebtSource, Trader, TraderId } from "@/lib/types";
import { formatUsd, toCents } from "./api";
import { Badge, btn, ErrorNote, field, label } from "./ui";

export interface Draft {
  n: number; // 1, 2, 3...: the order in the AI answer
  debtorId: string;
  creditorId: string;
  debtorText: string; // the name as written, shown when no trader is chosen
  creditorText: string;
  amount: string; // dollars, as typed
  note: string;
  confidence: DebtDraft["confidence"];
  question?: string;
  need?: { debtorId: boolean; creditorId: boolean; amount: boolean }; // what the AI left empty
  answered?: boolean; // the user changed or accepted the draft after the AI question
  editing?: boolean;
  source: DebtSource;
  saved?: Debt;
  error?: Error;
}

// Why the draft cannot be saved yet. Null when it is ready.
export function problem(d: Draft, traderId: TraderId, viewer: string): string | null {
  if (d.question && !d.answered) return d.question;
  if (!d.debtorId || !d.creditorId) return "Choose the debtor and the creditor.";
  if (d.debtorId === d.creditorId) return "The debtor and the creditor must be different traders.";
  if (toCents(d.amount) === null) return "Type an amount above 0, for example 50 or 12.50.";
  if (d.debtorId !== traderId && d.creditorId !== traderId)
    return `You view the app as ${viewer}. You can only save a debt where you are the debtor or the creditor. Change "View as" first.`;
  return null;
}

interface Props {
  d: Draft;
  index: number; // position in the list, for the stagger
  traders: Trader[];
  traderId: TraderId;
  name: (id: TraderId) => string;
  busy: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onDiscard: () => void;
}

const LABELS = { debtorId: "Debtor (owes)", creditorId: "Creditor (is owed)", amount: "Amount (USD)", note: "Note" } as const;

// One draft on one line. A draft that needs an answer shows only the missing fields. "Edit" opens all fields.
export function DraftRow({ d, index, traders, traderId, name, busy, onChange, onDiscard }: Props) {
  const ask = d.saved ? null : problem(d, traderId, name(traderId));
  const fixable = !d.saved && problem({ ...d, answered: true }, traderId, name(traderId)) === null;
  const editing = !d.saved && !!d.editing;
  const cents = toCents(d.amount);
  const side = (id: string, text: string) => (id ? name(id) : text || "someone");
  const creditor = d.creditorId === traderId ? "you" : side(d.creditorId, d.creditorText);
  const debtor = side(d.debtorId, d.debtorText);
  const who = d.debtorId === traderId ? `You owe ${creditor}` : `${debtor[0].toUpperCase()}${debtor.slice(1)} owes ${creditor}`;
  const same = !!d.debtorId && d.debtorId === d.creditorId;
  // Compact answer row: the fields the AI left empty, and the fields that are not valid now.
  const missing = (["debtorId", "creditorId", "amount"] as const).filter((key) =>
    key === "amount" ? d.need?.amount || cents === null : d.need?.[key] || !d[key] || same,
  );

  // mini: a field of the compact answer row. It does not open the full form.
  const control = (key: keyof typeof LABELS, mini: boolean) => {
    const id = `${key}-${d.n}`;
    const set = (value: string) => onChange({ [key]: value, answered: true, error: undefined, ...(mini ? {} : { editing: true }) });
    const cls = mini ? "capture-mini" : field;
    return (
      <div key={key} className={mini ? "capture-mini-field" : "space-y-1.5"}>
        <label htmlFor={id} className={mini ? "text-xs font-medium text-zinc-700" : label}>
          {LABELS[key]}
        </label>
        {key === "debtorId" || key === "creditorId" ? (
          <select id={id} value={d[key]} disabled={busy} onChange={(e) => set(e.target.value)} className={cls}>
            <option value="">Choose a trader</option>
            {traders.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            value={d[key]}
            disabled={busy}
            onChange={(e) => set(e.target.value)}
            {...(key === "amount" ? { inputMode: "decimal" as const, placeholder: "50" } : {})}
            className={cls}
          />
        )}
      </div>
    );
  };
  const discard = (
    <button type="button" className={btn.small} disabled={busy} onClick={onDiscard}>
      Discard
    </button>
  );

  return (
    <li className="capture-draft" data-state={d.saved ? "saved" : ask ? "ask" : "ready"} style={{ animationDelay: `${index * 120}ms` }}>
      <div className="capture-line">
        <span className="capture-num">{d.n}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">{who}</p>
          {d.note && <p className="truncate text-xs text-zinc-500">{d.note}</p>}
        </div>
        <span className="capture-amount">{cents === null ? "$ ?" : formatUsd(cents)}</span>
        <div className="capture-tools">
          {d.saved ? (
            <Badge tone="green">Saved</Badge>
          ) : (
            <>
              {ask && <Badge tone="amber">Needs an answer</Badge>}
              {d.confidence !== "high" && <Badge tone={d.confidence === "low" ? "red" : "amber"}>{d.confidence} confidence</Badge>}
              <button
                type="button"
                className={btn.small}
                aria-label={editing ? `Done with draft ${d.n}` : `Edit draft ${d.n}`}
                aria-expanded={editing}
                aria-controls={`fields-${d.n}`}
                disabled={busy}
                onClick={() => onChange(editing ? { editing: false, ...(fixable ? { answered: true } : {}) } : { editing: true })}
              >
                {editing ? "Done" : "Edit"}
              </button>
            </>
          )}
        </div>
      </div>
      {ask && (
        <div className="capture-answer">
          <p className="capture-ask">{ask}</p>
          {!editing && (
            <>
              {missing.map((key) => control(key, true))}
              {discard}
            </>
          )}
        </div>
      )}
      {editing && (
        <div id={`fields-${d.n}`} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">{(["debtorId", "creditorId", "amount"] as const).map((key) => control(key, false))}</div>
          {control("note", false)}
          {discard}
        </div>
      )}
      {d.error && <ErrorNote error={d.error} />}
    </li>
  );
}
