"use client";

import Link from "next/link";
import { useState } from "react";
import type { Debt } from "@/lib/types";
import { api, formatUsd, toCents, waitingFor } from "@/components/api";
import { useApp } from "@/components/app";
import { Badge, btn, Card, Empty, ErrorNote, field, Loading, PageHeader } from "@/components/ui";
import { GuideTip } from "@/components/guide-tip";
import { TraderChip } from "@/components/trader-chip";

interface Resolution {
  suggestion: string;
  proposedAmountCents: number | null;
}

function DebtItem({ debt, onChange }: { debt: Debt; onChange: () => void }) {
  const { traderId, name } = useApp();
  const [counter, setCounter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [ai, setAi] = useState<Resolution | null>(null);
  const [asking, setAsking] = useState(false);

  const mine = waitingFor(debt, traderId);
  const disputed = debt.status === "disputed" && debt.counterAmountCents !== undefined;
  const other = debt.debtorId === traderId ? debt.creditorId : debt.debtorId;
  const counterCents = counter === null ? null : toCents(counter);
  const otherOk = debt.debtorId === traderId ? debt.creditorOk : debt.debtorOk;
  // The debt and its state, from the side of the current trader. The page lists only the debts of this trader.
  const sentence = debt.debtorId === traderId ? `You owe ${name(other)}` : `${name(other)} owes you`;
  const approved = mine && !disputed && otherOk;
  const message = disputed
    ? debt.counterBy === traderId
      ? `You said ${formatUsd(debt.counterAmountCents!)}. Waiting for ${name(other)}.`
      : `${name(debt.counterBy)} says ${formatUsd(debt.counterAmountCents!)}. You said ${formatUsd(debt.amountCents)}.`
    : !mine
      ? `You approved. Waiting for ${name(other)}.`
      : otherOk
        ? `${name(other)} approved`
        : `Waiting for you and ${name(other)}.`;

  async function confirm(body: { ok: boolean; counterAmountCents?: number }) {
    setBusy(true);
    setError(null);
    try {
      await api<Debt>(`/api/debts/${debt.id}/confirm`, { traderId, ...body });
      setCounter(null);
      setAi(null);
      onChange();
    } catch (e) {
      setError(e as Error);
    }
    setBusy(false);
  }

  async function askAi() {
    setAsking(true);
    setError(null);
    try {
      setAi(await api<Resolution>(`/api/debts/${debt.id}/resolve`, {}));
    } catch (e) {
      setError(e as Error);
    }
    setAsking(false);
  }

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <TraderChip id={other} name={name(other)} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium text-zinc-900">{sentence}</p>
            {debt.note && <p className="text-sm text-zinc-600">{debt.note}</p>}
            <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${disputed ? "text-red-800" : approved ? "text-emerald-700" : "text-zinc-600"}`}>
              {approved && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m3 8.5 3 3 7-7" />
                </svg>
              )}
              {message}
            </p>
          </div>
          <p className="shrink-0 text-2xl font-medium tabular-nums text-brand">{formatUsd(debt.amountCents)}</p>
        </div>

        <div className="confirm-actions grid grid-cols-2 gap-2 empty:hidden">
          {mine && !disputed && (
            <button type="button" className={btn.primary} disabled={busy} onClick={() => confirm({ ok: true })}>
              Approve {formatUsd(debt.amountCents)}
            </button>
          )}
          {mine && disputed && (
            <button
              type="button"
              className={btn.primary}
              disabled={busy}
              onClick={() => confirm({ ok: true, counterAmountCents: debt.counterAmountCents })}
            >
              Accept {formatUsd(debt.counterAmountCents!)}
            </button>
          )}
          {mine && counter === null && (
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => setCounter("")}>
              Change amount
            </button>
          )}
          {disputed && (
            <button type="button" className={btn.secondary} disabled={asking} onClick={askAi}>
              {asking ? "Asking the AI..." : "Ask the AI"}
            </button>
          )}
        </div>

        {counter !== null && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (counterCents !== null) confirm({ ok: false, counterAmountCents: counterCents });
            }}
          >
            <div className="w-40 space-y-1.5">
              <label htmlFor={`counter-${debt.id}`} className="text-sm font-medium text-zinc-700">
                Your amount (USD)
              </label>
              <input
                id={`counter-${debt.id}`}
                inputMode="decimal"
                autoFocus
                value={counter}
                onChange={(e) => setCounter(e.target.value)}
                className={field}
              />
            </div>
            <button type="submit" className={btn.primary} disabled={busy || counterCents === null}>
              Send amount
            </button>
            <button type="button" className={btn.secondary} onClick={() => setCounter(null)}>
              Cancel
            </button>
          </form>
        )}

        {ai && (
          <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
            <p>
              <span className="font-medium">AI suggestion:</span> {ai.suggestion}
            </p>
            {ai.proposedAmountCents !== null && (
              <button
                type="button"
                className={btn.small}
                disabled={busy}
                onClick={() => confirm({ ok: true, counterAmountCents: ai.proposedAmountCents! })}
              >
                Accept {formatUsd(ai.proposedAmountCents)}
              </button>
            )}
          </div>
        )}

        {error && <ErrorNote error={error} />}
      </div>
    </Card>
  );
}

export default function ConfirmPage() {
  // The shared list: an answer from the bell updates this page too.
  const { traderId, refreshPending, debts } = useApp();

  const open = (debts.data ?? []).filter(
    (d) => (d.status === "proposed" || d.status === "disputed") && (d.debtorId === traderId || d.creditorId === traderId),
  );
  const forYou = open.filter((d) => waitingFor(d, traderId));
  const forOthers = open.filter((d) => !waitingFor(d, traderId));

  const changed = refreshPending; // reloads the shared list

  return (
    <div className="mx-auto max-w-[640px] space-y-8">
      <PageHeader title="Confirm debts">Both sides approve a debt before it enters clearing.</PageHeader>
      {debts.error ? (
        <ErrorNote error={debts.error} onRetry={debts.reload} />
      ) : debts.loading ? (
        <Loading />
      ) : open.length === 0 ? (
        <Empty title="Nothing to confirm">
          <p>Every debt is approved.</p>
          <div className="mt-5 grid gap-2 sm:flex sm:justify-center">
            <Link href="/" className={btn.primary}>
              Run clearing on the market
            </Link>
            <Link href="/add" className={btn.secondary}>
              Add a debt
            </Link>
          </div>
        </Empty>
      ) : (
        <>
          {[
            { title: "Waiting for you", list: forYou, empty: "No debt waits for your approval." },
            { title: "Waiting for the other side", list: forOthers, empty: "" },
          ]
            // A group with no empty text shows only when it has a debt.
            .filter((group) => group.empty || group.list.length > 0)
            .map((group) => (
              <section key={group.title} className="space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                  {group.title} <Badge tone={group.list.length > 0 ? "blue" : "neutral"}>{group.list.length}</Badge>
                </h2>
                {group.list.length === 0 ? (
                  <p className="text-sm text-zinc-600">{group.empty}</p>
                ) : (
                  group.list.map((d) => <DebtItem key={d.id} debt={d} onChange={changed} />)
                )}
              </section>
            ))}
        </>
      )}
      <GuideTip topic="confirm" />
    </div>
  );
}
