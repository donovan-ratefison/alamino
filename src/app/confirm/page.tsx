"use client";

import Link from "next/link";
import { useState } from "react";
import type { Debt } from "@/lib/types";
import { api, formatUsd, toCents, useApi, waitingFor } from "@/components/api";
import { useApp } from "@/components/app";
import { Badge, btn, Card, Empty, ErrorNote, field, Loading, PageHeader } from "@/components/ui";
import { Workflow } from "@/components/workflow";

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
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              {name(debt.debtorId)} owes {name(debt.creditorId)} {formatUsd(debt.amountCents)}
            </p>
            {debt.note && <p className="mt-0.5 text-sm text-zinc-600">{debt.note}</p>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={debt.status === "disputed" ? "red" : "amber"}>{debt.status === "disputed" ? "Disputed" : "Proposed"}</Badge>
            <Badge tone={debt.debtorOk ? "green" : "neutral"}>Debtor {debt.debtorOk ? "approved" : "not approved"}</Badge>
            <Badge tone={debt.creditorOk ? "green" : "neutral"}>Creditor {debt.creditorOk ? "approved" : "not approved"}</Badge>
          </div>
        </div>

        {disputed && (
          <dl className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <div>
              <dt className="text-zinc-600">Recorded amount</dt>
              <dd className="font-semibold tabular-nums">{formatUsd(debt.amountCents)}</dd>
            </div>
            <div>
              <dt className="text-zinc-600">{name(debt.counterBy)} says</dt>
              <dd className="font-semibold tabular-nums">{formatUsd(debt.counterAmountCents!)}</dd>
            </div>
          </dl>
        )}

        {!mine && <p className="text-sm text-zinc-600">Waiting for {name(other)}.</p>}

        <div className="flex flex-wrap gap-2">
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
              Different amount
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
  const { traderId, name, refreshPending } = useApp();
  const debts = useApi<Debt[]>("/api/debts");

  const open = (debts.data ?? []).filter(
    (d) => (d.status === "proposed" || d.status === "disputed") && (d.debtorId === traderId || d.creditorId === traderId),
  );
  const forYou = open.filter((d) => waitingFor(d, traderId));
  const forOthers = open.filter((d) => !waitingFor(d, traderId));

  function changed() {
    debts.reload();
    refreshPending();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title="Confirm debts">
        Both sides must approve a debt before it enters a clearing round. You view the app as{" "}
        <span className="font-medium text-zinc-900">{name(traderId)}</span>.
      </PageHeader>
      <Workflow current={1} />
      {debts.error ? (
        <ErrorNote error={debts.error} onRetry={debts.reload} />
      ) : debts.loading ? (
        <Loading />
      ) : open.length === 0 ? (
        <Empty title="Nothing to confirm">
          No debt waits for {name(traderId)}.{" "}
          <Link href="/add" className="font-medium text-accent underline">
            Add a debt
          </Link>
        </Empty>
      ) : (
        <>
          {[
            { title: "Waiting for you", list: forYou, empty: "No debt waits for your approval." },
            { title: "Waiting for the other side", list: forOthers, empty: "No debt waits for the other side." },
          ].map((group) => (
            <section key={group.title} className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                {group.title} ({group.list.length})
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
    </div>
  );
}
