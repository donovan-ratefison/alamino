"use client";

import { useState, type FormEvent } from "react";
import type { Debt, DebtDraft, DebtSource, Trader, TraderId } from "@/lib/types";
import { api, formatUsd, toCents } from "./api";
import { useApp } from "./app";
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
  question?: string; // the AI question: only a hint, plain code asks
  need?: { otherId: boolean; direction: boolean; amount: boolean }; // what the AI left empty
  manual?: boolean; // added by hand: asks "Fill this line." until it is valid
  answered?: boolean; // the user changed or accepted the line: no "Check this line" mark
  wayAnswered?: boolean; // the user answered the direction question on this line
  remember?: "offer" | "done"; // the user chose a trader for an unknown written name
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

// The first missing piece of the draft, asked in this order. Null when the draft is ready.
export function problem(d: Draft): "other" | "direction" | "amount" | null {
  return !d.otherId ? "other" : !d.direction ? "direction" : toCents(d.amount) === null ? "amount" : null;
}

const low = (s: string) => s.trim().toLowerCase();
const names = (t: Trader) => [t.name, ...t.aliases].map(low);

// Same name, one name inside the other, or the same first 3 letters.
function looksLike(t: Trader, text: string): boolean {
  const x = low(text);
  return !!x && names(t).some((y) => y.includes(x) || x.includes(y) || y.slice(0, 3) === x.slice(0, 3));
}

interface Props {
  d: Draft;
  index: number; // position in the list, for the stagger
  busy: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onDiscard: () => void;
  applyCount: number; // other drafts with no direction
  onApply: () => void; // gives them the direction of this draft
}

const DIRECTIONS = { you_owe: "You owe", owed_to_you: "Owes you" } as const;

// One draft on one line. Plain code asks for the first missing piece, with its answers as buttons. The row opens the full form.
export function DraftRow({ d, index, busy, onChange, onDiscard, applyCount, onApply }: Props) {
  const { traders, traderId, name, debts } = useApp();
  const [typed, setTyped] = useState("");
  const step = d.saved ? null : problem(d);
  const editing = !d.saved && !!d.editing;
  const cents = toCents(d.amount);
  const fromAi = !d.manual && !d.need?.otherId && !d.need?.direction && !d.need?.amount;
  const check = !d.saved && !step && fromAi && !d.answered && (d.confidence === "low" || !!d.question);
  const other = d.otherId ? name(d.otherId) : d.otherText ? `"${d.otherText}"` : "";
  const who =
    d.direction === "you_owe"
      ? `You owe ${other || "someone"}`
      : d.direction === "owed_to_you"
        ? `${other || "Someone"} owes you`
        : `${other || "Someone"}, direction not known`;

  const me = traders.find((t) => t.id === traderId);
  const ownName = !!me && !!d.otherText.trim() && names(me).includes(low(d.otherText));
  const partners = new Set(
    (debts.data ?? []).flatMap((x) => (x.debtorId === traderId ? [x.creditorId] : x.creditorId === traderId ? [x.debtorId] : [])),
  );
  // Names that look like the written name first, then the traders you have debts with, then the rest.
  const ranked = traders
    .filter((t) => t.id !== traderId)
    .map((t) => ({ t, rank: looksLike(t, d.otherText) ? 0 : partners.has(t.id) ? 1 : 2 }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ t }) => t);

  const set = (patch: Partial<Draft>) => onChange({ ...patch, answered: true, error: undefined });
  const amountText = cents === null ? "" : ` ${formatUsd(cents)}`;
  const sentences: Record<Direction, string> = {
    you_owe: `I owe ${other}${amountText}`,
    owed_to_you: `${other} owes me${amountText}`,
  };

  const wayButtons = (pressed: boolean, answer: Partial<Draft>) => (
    <div role="group" aria-label="Direction" className="capture-choices">
      {(Object.keys(sentences) as Direction[]).map((value) => (
        <button
          key={value}
          type="button"
          className="capture-choice"
          aria-pressed={pressed ? d.direction === value : undefined}
          disabled={busy}
          onClick={() => set({ direction: value, ...answer })}
        >
          {sentences[value]}
        </button>
      ))}
    </div>
  );

  function saveAmount(e: FormEvent) {
    e.preventDefault();
    set({ amount: typed });
  }

  async function remember() {
    try {
      await api(`/api/traders/${d.otherId}/aliases`, { alias: d.otherText });
      onChange({ remember: "done", error: undefined });
    } catch (error) {
      onChange({ error: error as Error });
    }
  }

  // The question for the first missing piece, with its answers. Hidden while the full form is open.
  const ask =
    step === "other" ? (
      <>
        {/* The question and the way out share one row, so the trader pills fit one row on a phone. */}
        <div className="flex basis-full items-center justify-between gap-3">
          <p className="capture-ask">
            {ownName ? "This line has your own name. Who is the other trader?" : d.otherText.trim() ? `Who is "${d.otherText.trim()}"?` : "Who is the other trader?"}
          </p>
          <button type="button" className="-my-2 shrink-0 py-2 text-sm font-medium text-accent hover:underline disabled:opacity-50" disabled={busy} onClick={onDiscard}>
            {ownName ? "Skip this line" : d.otherText.trim() ? "Not in this market" : "Discard"}
          </button>
        </div>
        <div role="group" aria-label="Other trader" className="capture-choices">
          {ranked.map((t) => (
            <button
              key={t.id}
              type="button"
              className="capture-choice"
              disabled={busy}
              onClick={() => set({ otherId: t.id, ...(d.otherText.trim() && !ownName ? { remember: "offer" as const } : {}) })}
            >
              {t.name}
            </button>
          ))}
        </div>
      </>
    ) : step === "direction" ? (
      <>
        <p className="capture-ask">Which way does the debt go?</p>
        {wayButtons(false, { wayAnswered: true })}
      </>
    ) : step === "amount" ? (
      <form className="capture-choices" onSubmit={saveAmount}>
        <label htmlFor={`ask-amount-${d.n}`} className="capture-ask">
          How much?
        </label>
        <input
          id={`ask-amount-${d.n}`}
          inputMode="decimal"
          placeholder="50"
          value={typed}
          disabled={busy}
          onChange={(e) => setTyped(e.target.value)}
          className="capture-mini"
        />
        <button type="submit" className={btn.small} disabled={busy || toCents(typed) === null}>
          OK
        </button>
      </form>
    ) : null;

  const directionControl = (
    <div className="space-y-1.5">
      <span id={`direction-${d.n}`} className={label}>
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
              onChange={() => set({ direction: value })}
            />
            {DIRECTIONS[value]}
          </label>
        ))}
      </div>
    </div>
  );

  const input = (key: "amount" | "note") => (
    <div className="space-y-1.5">
      <label htmlFor={`${key}-${d.n}`} className={label}>
        {key === "amount" ? "Amount (USD)" : "Note"}
      </label>
      <input
        id={`${key}-${d.n}`}
        value={d[key]}
        disabled={busy}
        onChange={(e) => set({ [key]: e.target.value })}
        {...(key === "amount" ? { inputMode: "decimal" as const, placeholder: "50" } : {})}
        className={field}
      />
    </div>
  );

  const summary = (
    <>
      <span className="capture-num">{d.n}</span>
      <span className="capture-who">
        <span id={`sum-who-${d.n}`} className="capture-text">
          {who}
        </span>
        {d.saved ? <Badge tone="green">Saved</Badge> : check && <Badge tone="amber">Check this line</Badge>}
        {d.note && <span className="capture-note">{d.note}</span>}
      </span>
      <span id={`sum-amount-${d.n}`} className="capture-amount">
        {cents === null ? "$ ?" : formatUsd(cents)}
      </span>
    </>
  );

  return (
    <li>
      <div
        role="group"
        aria-label={`Draft ${d.n}`}
        className="capture-draft"
        data-state={d.saved ? "saved" : step ? "ask" : "ready"}
        style={{ animationDelay: `${index * 120}ms` }}
      >
        {d.saved ? (
          <div className="capture-line">{summary}</div>
        ) : (
          <button
            type="button"
            className="capture-line"
            aria-label={`Edit draft ${d.n}`}
            aria-describedby={`sum-who-${d.n} sum-amount-${d.n}`}
            aria-expanded={editing}
            aria-controls={`fields-${d.n}`}
            disabled={busy}
            onClick={() => onChange({ editing: !editing })}
          >
            {summary}
            <svg className="capture-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="m4 6 4 4 4-4" />
            </svg>
          </button>
        )}
        {step && (
          <div className="capture-answer">
            {editing ? (
              <p className="capture-ask">{d.manual ? "Fill this line." : "Fill the missing fields."}</p>
            ) : (
              <>
                {ask}
                {d.question && <p className="capture-hint">{d.question}</p>}
              </>
            )}
          </div>
        )}
        {check && !editing && (
          <div className="capture-answer">
            {wayButtons(true, {})}
            <button type="button" className={btn.small} disabled={busy} onClick={() => onChange({ answered: true })}>
              Looks right
            </button>
          </div>
        )}
        {!d.saved && d.wayAnswered && applyCount > 0 && (
          <div className="capture-answer">
            <button type="button" className={btn.small} disabled={busy} onClick={onApply}>
              {applyCount === 1 ? "Apply to the other line" : `Apply to the ${applyCount} other lines`}
            </button>
          </div>
        )}
        {d.remember && d.otherId && (
          <div className="capture-answer">
            {d.remember === "done" ? (
              <p role="status" className="capture-hint">
                Remembered
              </p>
            ) : (
              <button type="button" className={btn.small} disabled={busy} onClick={remember}>
                Remember &quot;{d.otherText.trim()}&quot; as {name(d.otherId)}
              </button>
            )}
          </div>
        )}
        {editing && (
          <div id={`fields-${d.n}`} className="space-y-4">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(13rem,100%),1fr))] gap-4">
              {directionControl}
              <div className="space-y-1.5">
                <label htmlFor={`other-${d.n}`} className={label}>
                  Other trader
                </label>
                <select
                  id={`other-${d.n}`}
                  value={d.otherId}
                  disabled={busy}
                  // A line added by hand opens with the focus here.
                  autoFocus={d.manual && !d.otherId}
                  onChange={(e) => set({ otherId: e.target.value })}
                  className={field}
                >
                  <option value="">Choose a trader</option>
                  {ranked.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              {input("amount")}
            </div>
            {input("note")}
            <button type="button" className={btn.small} disabled={busy} onClick={onDiscard}>
              Discard
            </button>
          </div>
        )}
        {d.error && <ErrorNote error={d.error} />}
      </div>
    </li>
  );
}
