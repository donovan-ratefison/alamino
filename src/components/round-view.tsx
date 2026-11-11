"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import type { Edge, PaymentStatus, Round, Settlement, TraderId } from "@/lib/types";
import { api, formatUsd, useApi } from "./api";
import { useApp } from "./app";
import { ClearingReplay } from "./clearing-replay";
import { Badge, btn, Card, Empty, ErrorNote, Loading, PageHeader, Stat } from "./ui";
import { Workflow } from "./workflow";

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });
const sum = (edges: Edge[]) => edges.reduce((n, e) => n + e.amountCents, 0);

const paypalOptions = { clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "", currency: "USD" };

const statusBadge: Record<PaymentStatus, { text: string; tone: "neutral" | "amber" | "green" | "blue" | "red" }> = {
  none: { text: "Not started", tone: "neutral" },
  pending: { text: "Pending", tone: "amber" },
  captured: { text: "Paid in", tone: "green" },
  sent: { text: "Sent", tone: "blue" },
  confirmed: { text: "Paid out", tone: "green" },
  failed: { text: "Failed", tone: "red" },
};

function PayIn({ roundId, s, onPaid }: { roundId: string; s: Settlement; onPaid: () => void }) {
  const { config } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const base = `/api/rounds/${roundId}/payin/${s.traderId}`;
  const createOrder = async () => (await api<{ orderId: string }>(`${base}/order`, {})).orderId;
  const capture = async (orderId: string) => {
    await api<Settlement>(`${base}/capture`, { orderId });
    onPaid();
  };

  async function paySimulated() {
    setBusy(true);
    setError(null);
    try {
      await capture(await createOrder());
    } catch (e) {
      setError(e as Error);
    }
    setBusy(false);
  }

  if (!config) return null;
  return (
    <div className="w-full space-y-2 sm:w-auto sm:min-w-56">
      {config.paypalMode === "simulated" ? (
        <button type="button" className={btn.primary} disabled={busy} onClick={paySimulated}>
          {busy ? "Paying..." : `Pay ${formatUsd(s.amountCents)} (simulated)`}
        </button>
      ) : paypalOptions.clientId ? (
        <div className="space-y-2"><p className="text-xs text-zinc-600">Sandbox payments require <Link href="/finance" className="text-accent underline">finance admin sign-in</Link>.</p><PayPalScriptProvider options={paypalOptions}>
          <PayPalButtons
            style={{ layout: "horizontal", height: 48, tagline: false, shape: "pill", color: "blue" }}
            createOrder={createOrder}
            onApprove={(data) => capture(data.orderID).catch((e) => setError(e as Error))}
            onError={(e) => setError(new Error(String(e?.message ?? "PayPal error")))}
          />
        </PayPalScriptProvider></div>
      ) : (
        <p className="text-sm text-red-700">The PayPal button needs NEXT_PUBLIC_PAYPAL_CLIENT_ID.</p>
      )}
      {error && <ErrorNote error={error} />}
    </div>
  );
}

export function RoundView({ id }: { id: string }) {
  const { traderId, setTraderId, name } = useApp();
  const round = useApi<Round>(`/api/rounds/${id}`);
  const { set, reload } = round;
  const [hover, setHover] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<Error | null>(null);

  const roundId = round.data?.id;
  const status = round.data?.status;

  // Payouts are sent: ask the server every 3 s until PayPal confirms them.
  useEffect(() => {
    if (status !== "paying" || !roundId) return;
    const timer = setInterval(() => {
      api<Round>(`/api/rounds/${roundId}/payout/refresh`, {}).then(set, (e) => setActionError(e as Error));
    }, 3000);
    return () => clearInterval(timer);
  }, [status, roundId, set]);

  if (round.error?.status === 404) {
    return (
      <Empty title="No clearing round yet">
        <Link href="/" className="font-medium text-accent underline">
          Go to the market
        </Link>{" "}
        and run clearing.
      </Empty>
    );
  }
  if (round.error) return <ErrorNote error={round.error} onRetry={reload} />;
  if (!round.data) return <Loading />;

  const r = round.data;
  const { stats, cancellations } = r.result;
  const payIns = r.settlements.filter((s) => s.direction === "pay_in");
  const payOuts = r.settlements.filter((s) => s.direction === "pay_out");
  const paidIn = payIns.filter((s) => s.status === "captured");
  const allPaidIn = paidIn.length === payIns.length;
  const canSendPayouts = allPaidIn && payOuts.some((s) => s.status === "none") && r.status !== "paying" && r.status !== "done";
  const active = hover ?? selected;
  const circle = (path: string[]) => [...path, path[0]].map(name).join(" → ");
  const names = (ids: TraderId[]) => listFormat.format(ids.map(name));

  // What the current trader owed and was owed before the round, and what is left to pay or receive.
  const me = r.settlements.find((s) => s.traderId === traderId);
  const owed = sum(r.debtsBefore.filter((e) => e.debtorId === traderId));
  const owedToMe = sum(r.debtsBefore.filter((e) => e.creditorId === traderId));
  const facts = `You owed ${formatUsd(owed)}. You were owed ${formatUsd(owedToMe)}.`;
  const waiting = payIns.filter((s) => s.status !== "captured").map((s) => s.traderId);

  async function sendPayouts() {
    setSending(true);
    setActionError(null);
    try {
      set(await api<Round>(`/api/rounds/${r.id}/payout`, {}));
    } catch (e) {
      setActionError(e as Error);
    }
    setSending(false);
  }

  const row = (s: Settlement) => {
    const badge = statusBadge[s.status];
    return (
      <li key={`${s.direction}-${s.traderId}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-3">
          <span className="w-16 text-sm font-medium text-zinc-900">{name(s.traderId)}</span>
          <span className="w-20 text-sm tabular-nums text-zinc-900">{formatUsd(s.amountCents)}</span>
          <Badge tone={badge.tone}>{badge.text}</Badge>
        </div>
        {s.direction === "pay_in" && s.status !== "captured" && s.traderId !== traderId && (
          <button type="button" className={btn.small} onClick={() => setTraderId(s.traderId)}>
            View as {name(s.traderId)} to pay
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader title={`${formatUsd(stats.grossCents)} of debt settled with ${formatUsd(stats.cashMovedCents)}`}>
        <span className="inline-flex flex-wrap items-center gap-2">
          Round {r.id} <Badge>Status: {r.status}</Badge>
        </span>
      </PageHeader>

      <Card>
        <div className="max-w-xl space-y-4">
          {me?.direction === "pay_in" ? (
            <>
              <p className="eyebrow text-zinc-500">You pay once</p>
              <p className="text-5xl font-medium leading-none tracking-tight tabular-nums text-brand">{formatUsd(me.amountCents)}</p>
              <p className="text-sm text-zinc-600">
                {facts}
                {me.amountCents < owed && " Alamino cancelled the rest."}
              </p>
              {me.status === "captured" ? (
                <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
                  <Badge tone="green">Paid in</Badge> You paid {formatUsd(me.amountCents)} into the clearing account.
                </p>
              ) : (
                <PayIn key={me.traderId} roundId={r.id} s={me} onPaid={reload} />
              )}
            </>
          ) : me?.direction === "pay_out" ? (
            <>
              <p className="eyebrow text-zinc-500">You receive</p>
              <p className="text-5xl font-medium leading-none tracking-tight tabular-nums text-brand">{formatUsd(me.amountCents)}</p>
              <p className="text-sm text-zinc-600">
                {`You were owed ${formatUsd(owedToMe)}. You owed ${formatUsd(owed)}.`}
                {me.amountCents < owedToMe && " Alamino cancelled the rest."}
              </p>
              {me.status === "none" ? (
                <p className="text-sm font-medium text-zinc-800">
                  {waiting.length > 0
                    ? `Paid to you when ${names(waiting)} ${waiting.length === 1 ? "has" : "have"} paid in.`
                    : "Every pay-in is paid. Your payout can start."}
                </p>
              ) : (
                <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
                  Your payout: <Badge tone={statusBadge[me.status].tone}>{statusBadge[me.status].text}</Badge>
                </p>
              )}
            </>
          ) : (
            <>
              <p className="eyebrow text-zinc-500">Nothing to pay</p>
              <p className="text-2xl font-medium tracking-tight text-brand">
                {owed + owedToMe > 0 ? "Nothing to pay. Your debts cancelled." : "Nothing to pay. You have no debt in this round."}
              </p>
              {owed + owedToMe > 0 && <p className="text-sm text-zinc-600">{facts}</p>}
            </>
          )}

          {payIns.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              <ul className="flex gap-1.5">
                {payIns.map((s) => {
                  const paid = s.status === "captured";
                  const text = `${name(s.traderId)}: ${paid ? "paid in" : "not paid in"}`;
                  return (
                    <li
                      key={s.traderId}
                      title={text}
                      className={`grid size-7 place-items-center rounded-full border text-[11px] font-semibold ${
                        paid ? "border-emerald-700 bg-emerald-700 text-white" : "border-dashed border-zinc-400 bg-white text-zinc-600"
                      }`}
                    >
                      <span aria-hidden="true">{name(s.traderId).charAt(0)}</span>
                      <span className="sr-only">{text}</span>
                    </li>
                  );
                })}
              </ul>
              <span>
                {paidIn.length} of {payIns.length} {payIns.length === 1 ? "trader" : "traders"} paid in
              </span>
            </div>
          )}

          <div className="space-y-3 border-t border-zinc-200 pt-4">
            {r.status === "done" ? (
              <div role="status" className="space-y-3">
                <p className="text-sm font-medium text-emerald-800">Round complete. Every pay-in and pay-out is done.</p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/statement" className={btn.primary}>
                    Read your statement
                  </Link>
                  <Link href="/" className={btn.secondary}>
                    Go to the market
                  </Link>
                </div>
              </div>
            ) : r.status === "paying" ? (
              <p role="status" className="text-sm text-zinc-700">
                Payouts sent. Waiting for PayPal to confirm them...
              </p>
            ) : canSendPayouts ? (
              <button type="button" className={btn.primary} disabled={sending} onClick={sendPayouts}>
                {sending ? "Sending payouts..." : "Send payouts"}
              </button>
            ) : (
              <p className="text-sm text-zinc-600">Payouts start when every pay-in is paid.</p>
            )}
            {actionError && <ErrorNote error={actionError} />}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={formatUsd(stats.grossCents)} label="of debt" />
        <Stat value={formatUsd(stats.clearedByCirclesCents)} label="cancelled by circles, no money moved" />
        <Stat value={formatUsd(stats.cashMovedCents)} label={r.status === "done" ? "settled through PayPal" : "planned through PayPal"} />
        <Stat value={`${stats.savedPct.toFixed(1)}%`} label="cash saved" />
      </div>

      <details className="border-t border-zinc-200 pt-4" onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-medium text-accent">See what cancelled</summary>
        <div className="mt-6 space-y-6">
          {open && <ClearingReplay round={r} highlight={active === null ? undefined : cancellations[active]?.path} />}

          <Card title={`Circles cancelled (${cancellations.length})`}>
            {cancellations.length === 0 ? (
              <p className="text-sm text-zinc-600">No circle in these debts. All debts go to the settlement plan.</p>
            ) : (
              <ul className="space-y-2">
                {cancellations.map((c, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      aria-pressed={selected === i}
                      onClick={() => setSelected(selected === i ? null : i)}
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover(null)}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                        active === i ? "border-accent bg-blue-50 text-zinc-900" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      {circle(c.path)}: <span className="font-semibold tabular-nums">{formatUsd(c.amountCents)}</span> cancelled
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Settlement plan">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Pay in to the clearing account</h3>
                {payIns.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-600">Nobody pays in.</p>
                ) : (
                  <ul className="divide-y divide-zinc-200">{payIns.map(row)}</ul>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Paid out by the clearing account</h3>
                {payOuts.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-600">Nobody is paid out.</p>
                ) : (
                  <ul className="divide-y divide-zinc-200">{payOuts.map(row)}</ul>
                )}
              </div>
            </div>
          </Card>
        </div>
      </details>

      <Workflow current={3} />
    </div>
  );
}
