"use client";

import type { Debt, DebtDraft, DebtSource, Trader, TraderId } from "@/lib/types";
import { formatUsd, toCents } from "./api";
import { Badge, btn, ErrorNote, field, label } from "./ui";

type Direction = NonNullable<DebtDraft["direction"]>;

// A draft is always a debt between the current trader ("you") and one other trader.
export interface Draft {
  n: number; // 1, 2, 3...: the order on the page, then the lines added by hand
  otherId: string; // the other trader, "" while unknown. Never the current trader.
  otherText: string; // the other name as written, shown when no trader is chosen
  direction: Direction | "";
  amount: string; // dollars, as typed
  note: string;
  confidence: DebtDraft["confidence"];
  question?: string;
  need?: { otherId: boolean; direction: boolean; amount: boolean }; // what the AI left empty
  manual?: boolean; // added by hand: asks "Fill this line." until it is valid
  answered?: boolean; // the user changed or accepted the draft after the AI question
  editing?: boolean;
  source: DebtSource;
  saved?: Debt;
  error?: Error;
}

// Converts an API draft to a screen draft, from the side of the current trader.
// ponytail: the debtorId/creditorId branch reads the API before counterpartyId and direction. Remove it when every API sends them.
export function toDraft(d: DebtDraft, n: number, traderId: TraderId, source: DebtSource): Draft {
  let other = d.counterpartyId;
  let otherText = d.counterpartyText ?? "";
  let direction = d.direction;
  if (other === undefined || direction === undefined) {
    direction = d.debtorId === traderId ? "you_owe" : d.creditorId === traderId ? "owed_to_you" : null;
    other = direction === "you_owe" ? d.creditorId : direction === "owed_to_you" ? d.debtorId : null;
    otherText = direction === "you_owe" ? d.creditorText : direction === "owed_to_you" ? d.debtorText : "";
  }
  if (other === traderId) other = null; // the current trader is never the other side
  return {
    n,
    otherId: other ?? "",
    otherText,
    direction: direction ?? "",
    amount: d.amountCents === null ? "" : String(d.amountCents / 100),
    note: d.note,
    confidence: d.confidence,
    question: d.question,
    need: { otherId: !other, direction: !direction, amount: d.amountCents === null },
    source,
  };
}

// Why the draft cannot be saved yet. Null when it is ready.
export function problem(d: Draft): string | null {
  if (d.question && !d.answered) return d.question;
  const why = !d.otherId
    ? "Choose the other trader."
    : !d.direction
      ? "Choose the direction."
      : toCents(d.amount) === null
        ? "Type an amount above 0, for example 50 or 12.50."
        : null;
  return why && d.manual ? "Fill this line." : why;
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

const DIRECTIONS = { you_owe: "You owe", owed_to_you: "Owes you" } as const;

// One draft on one line. A draft that needs an answer shows only the missing fields. "Edit" opens all fields.
export function DraftRow({ d, index, traders, traderId, name, busy, onChange, onDiscard }: Props) {
  const ask = d.saved ? null : problem(d);
  const fixable = !d.saved && problem({ ...d, answered: true }) === null;
  const editing = !d.saved && !!d.editing;
  const cents = toCents(d.amount);
  const other = d.otherId ? name(d.otherId) : d.otherText ? `"${d.otherText}"` : "";
  const who =
    d.direction === "you_owe"
      ? `You owe ${other || "someone"}`
      : d.direction === "owed_to_you"
        ? `${other || "Someone"} owes you`
        : `${other || "Someone"}, direction not known`;

  // mini: a field of the compact answer row. It does not open the full form.
  const set = (patch: Partial<Draft>, mini: boolean) => onChange({ ...patch, answered: true, error: undefined, ...(mini ? {} : { editing: true }) });
  const box = (mini: boolean) => (mini ? "capture-mini-field" : "space-y-1.5");
  const caption = (mini: boolean) => (mini ? "text-xs font-medium text-zinc-700" : label);

  const otherSelect = (mini: boolean) => (
    <div key="other" className={box(mini)}>
      <label htmlFor={`other-${d.n}`} className={caption(mini)}>
        Other trader
      </label>
      <select
        id={`other-${d.n}`}
        value={d.otherId}
        disabled={busy}
        // A line added by hand opens with the focus here.
        autoFocus={!mini && d.manual && !d.otherId}
        onChange={(e) => set({ otherId: e.target.value }, mini)}
        className={mini ? "capture-mini" : field}
      >
        <option value="">Choose a trader</option>
        {traders
          .filter((t) => t.id !== traderId)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
      </select>
    </div>
  );

  const directionControl = (mini: boolean) => (
    <div key="direction" className={box(mini)}>
      <span id={`direction-${d.n}`} className={caption(mini)}>
        Direction
      </span>
      <div role="radiogroup" aria-labelledby={`direction-${d.n}`} className="capture-dir">
        {(Object.keys(DIRECTIONS) as Direction[]).map((value) => (
          <label key={value}>
            <input
              type="radio"
              name={`direction-${d.n}`}
              value={value}
              checked={d.direction === value}
              disabled={busy}
              onChange={() => set({ direction: value }, mini)}
            />
            {DIRECTIONS[value]}
          </label>
        ))}
      </div>
    </div>
  );

  const input = (key: "amount" | "note", mini: boolean) => (
    <div key={key} className={box(mini)}>
      <label htmlFor={`${key}-${d.n}`} className={caption(mini)}>
        {key === "amount" ? "Amount (USD)" : "Note"}
      </label>
      <input
        id={`${key}-${d.n}`}
        value={d[key]}
        disabled={busy}
        onChange={(e) => set({ [key]: e.target.value }, mini)}
        {...(key === "amount" ? { inputMode: "decimal" as const, placeholder: "50" } : {})}
        className={mini ? "capture-mini" : field}
      />
    </div>
  );

  const discard = (
    <button type="button" className={btn.small} disabled={busy} onClick={onDiscard}>
      Discard
    </button>
  );

  return (
    <li>
      <div
        role="group"
        aria-label={`Draft ${d.n}`}
        className="capture-draft"
        data-state={d.saved ? "saved" : ask ? "ask" : "ready"}
        style={{ animationDelay: `${index * 120}ms` }}
      >
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
                {(d.need?.otherId || !d.otherId) && otherSelect(true)}
                {(d.need?.direction || !d.direction) && directionControl(true)}
                {(d.need?.amount || cents === null) && input("amount", true)}
                {discard}
              </>
            )}
          </div>
        )}
        {editing && (
          <div id={`fields-${d.n}`} className="space-y-4">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(13rem,100%),1fr))] gap-4">
              {directionControl(false)}
              {otherSelect(false)}
              {input("amount", false)}
            </div>
            {input("note", false)}
            {discard}
          </div>
        )}
        {d.error && <ErrorNote error={d.error} />}
      </div>
    </li>
  );
}
