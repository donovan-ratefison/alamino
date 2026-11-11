"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Debt } from "@/lib/types";
import { api, formatUsd, toCents, waitingFor } from "./api";
import { useApp } from "./app";
import { btn, ErrorNote, field } from "./ui";

const approve = `${btn.primary} ui-button-compact`;
const secondary = `${btn.secondary} ui-button-compact`;

function BellItem({ debt, onDone }: { debt: Debt; onDone: (message: string) => void }) {
  const { traderId, name } = useApp();
  const [counter, setCounter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const other = debt.debtorId === traderId ? debt.creditorId : debt.debtorId;
  const disputed = debt.status === "disputed" && debt.counterAmountCents !== undefined;
  const amount = disputed ? debt.counterAmountCents! : debt.amountCents;
  const relation = debt.debtorId === traderId ? `you owe ${name(other)}` : `${name(other)} owes you`;
  const counterCents = counter === null ? null : toCents(counter);

  async function send(body: { ok: boolean; counterAmountCents?: number }) {
    setBusy(true);
    setError(null);
    try {
      const saved = await api<Debt>(`/api/debts/${debt.id}/confirm`, { traderId, ...body });
      onDone(saved.status === "confirmed" ? "Confirmed." : `Sent to ${name(other)}.`);
    } catch (e) {
      setError(e as Error);
    }
    setBusy(false);
  }

  return (
    <li className="bell-item">
      <p className="text-sm leading-6">
        <span className="font-semibold">{name(disputed ? debt.counterBy : other)}</span> says: {relation}{" "}
        <span className="font-semibold tabular-nums">{formatUsd(amount)}</span>
        {disputed && <>, not {formatUsd(debt.amountCents)}</>}
        {debt.note && <>, {debt.note}</>}.
      </p>
      <div className="flex flex-wrap gap-2">
        {disputed ? (
          <button type="button" className={approve} disabled={busy} onClick={() => send({ ok: true, counterAmountCents: amount })}>
            Accept {formatUsd(amount)}
          </button>
        ) : (
          <button type="button" className={approve} disabled={busy} onClick={() => send({ ok: true })}>
            Approve
          </button>
        )}
        {counter === null && (
          <button type="button" className={secondary} disabled={busy} onClick={() => setCounter("")}>
            Different amount
          </button>
        )}
      </div>
      {counter !== null && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (counterCents !== null) send({ ok: false, counterAmountCents: counterCents });
          }}
        >
          <div className="w-32 space-y-1">
            <label htmlFor={`bell-counter-${debt.id}`} className="text-xs font-medium text-zinc-700">
              Your amount (USD)
            </label>
            <input
              id={`bell-counter-${debt.id}`}
              inputMode="decimal"
              autoFocus
              value={counter}
              onChange={(e) => setCounter(e.target.value)}
              className={field}
            />
          </div>
          <button type="submit" className={approve} disabled={busy || counterCents === null}>
            Send
          </button>
          <button type="button" className={secondary} onClick={() => setCounter(null)}>
            Cancel
          </button>
        </form>
      )}
      {error && <ErrorNote error={error} />}
    </li>
  );
}

export function Bell() {
  const { debts, traderId, refreshPending } = useApp();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const waiting = (debts.data ?? []).filter((d) => waitingFor(d, traderId));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        className="bell-button"
        aria-label={waiting.length > 0 ? `Notifications, ${waiting.length} waiting` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? "bell-panel" : undefined}
        onClick={() => {
          setNotice(null);
          setOpen(!open);
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {waiting.length > 0 && <span className="bell-count" aria-hidden="true">{waiting.length}</span>}
      </button>
      {open && (
        <div id="bell-panel" role="dialog" aria-label="Waiting for you" className="bell-panel">
          <div className="flex items-center justify-between gap-3 px-2 pb-1 text-xs text-zinc-500">
            <span>Waiting for you</span>
            <Link href="/confirm" className="font-medium text-accent underline" onClick={() => setOpen(false)}>
              Open Confirm
            </Link>
          </div>
          {notice && (
            <p role="status" className="rounded-xl bg-brand-deep px-3 py-2 text-sm font-medium text-white">
              {notice}
            </p>
          )}
          {waiting.length === 0 ? (
            <p className="px-2 py-3 text-sm text-zinc-600">Nothing waits for you.</p>
          ) : (
            <ul className="grid gap-2">
              {waiting.map((d) => (
                <BellItem
                  key={d.id}
                  debt={d}
                  onDone={(message) => {
                    setNotice(message);
                    refreshPending();
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
