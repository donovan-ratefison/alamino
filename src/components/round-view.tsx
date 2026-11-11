"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import type { PaymentStatus, Round, Settlement } from "@/lib/types";
import { api, formatUsd, useApi } from "./api";
import { useApp } from "./app";
import { Network } from "./network";
import { Badge, btn, Card, Empty, ErrorNote, Loading, PageHeader, Stat } from "./ui";

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
        <PayPalScriptProvider options={paypalOptions}>
          <PayPalButtons
            style={{ layout: "horizontal", height: 36, tagline: false }}
            createOrder={createOrder}
            onApprove={(data) => capture(data.orderID).catch((e) => setError(e as Error))}
            onError={(e) => setError(new Error(String(e?.message ?? "PayPal error")))}
          />
        </PayPalScriptProvider>
      ) : (
        <p className="text-sm text-red-700">The PayPal button needs NEXT_PUBLIC_PAYPAL_CLIENT_ID.</p>
      )}
      {error && <ErrorNote error={error} />}
    </div>
  );
}

export function RoundView({ id }: { id: string }) {
  const { traders, traderId, setTraderId, name } = useApp();
  const round = useApi<Round>(`/api/rounds/${id}`);
  const { set, reload } = round;
  const [hover, setHover] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
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
  const allPaidIn = payIns.every((s) => s.status === "captured");
  const canSendPayouts = allPaidIn && payOuts.some((s) => s.status === "none") && r.status !== "paying" && r.status !== "done";
  const active = hover ?? selected;
  const circle = (path: string[]) => [...path, path[0]].map(name).join(" → ");

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
        {s.direction === "pay_in" &&
          s.status !== "captured" &&
          (s.traderId === traderId ? (
            <PayIn roundId={r.id} s={s} onPaid={reload} />
          ) : (
            <button type="button" className={btn.small} onClick={() => setTraderId(s.traderId)}>
              View as {name(s.traderId)} to pay
            </button>
          ))}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Clearing round">
        <span className="inline-flex flex-wrap items-center gap-2">
          Round {r.id} <Badge>Status: {r.status}</Badge>
        </span>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={formatUsd(stats.grossCents)} label="of debt" />
        <Stat value={formatUsd(stats.clearedByCirclesCents)} label="cancelled by circles, no money moved" />
        <Stat value={formatUsd(stats.cashMovedCents)} label="paid through PayPal" />
        <Stat value={`${stats.savedPct.toFixed(1)}%`} label="cash saved" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Before" actions={<span className="text-xs text-zinc-500">Select a circle to show it here</span>}>
          {traders.length > 0 && (
            <Network traders={traders} edges={r.debtsBefore} highlight={active === null ? undefined : cancellations[active]?.path} label="Debts before the round" />
          )}
        </Card>
        <Card title="After circles cancel">
          {traders.length > 0 && <Network traders={traders} edges={r.result.remaining} label="Debts after circles cancel" />}
          {r.result.remaining.every((e) => e.amountCents === 0) && <p className="mt-3 text-sm text-zinc-600">No debt is left.</p>}
        </Card>
      </div>

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

        <div className="mt-4 space-y-3 border-t border-zinc-200 pt-4">
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
      </Card>
    </div>
  );
}
