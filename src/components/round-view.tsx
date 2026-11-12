"use client";

import { GuideTip } from "./guide-tip";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PayPalButtons, PayPalScriptProvider, usePayPalScriptReducer, type PayPalButtonsComponentProps } from "@paypal/react-paypal-js";
import { HOUSE, type Edge, type PaymentStatus, type Round, type Settlement } from "@/lib/types";
import { api, formatUsd, useApi } from "./api";
import { useApp } from "./app";
import { circleSize, ClearingReplay } from "./clearing-replay";
import { CountUp } from "./count-up";
import { TraderChip } from "./trader-chip";
import { Badge, btn, Card, Empty, ErrorNote, Loading, PageHeader } from "./ui";

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

const placeholder = "grid min-h-12 place-items-center rounded-full border border-blue-200 bg-blue-50 text-sm font-medium text-brand";

// The sandbox buttons, with a readable placeholder until PayPal has drawn them.
function SandboxButtons(props: PayPalButtonsComponentProps) {
  const [{ isRejected }] = usePayPalScriptReducer();
  const [ready, setReady] = useState(false);
  if (isRejected) return <p role="alert" className="text-sm text-red-700">PayPal did not load. Reload the page to try again.</p>;
  return (
    <div className="relative min-h-12">
      <PayPalButtons {...props} onInit={() => setReady(true)} />
      {!ready && (
        <p role="status" className={`absolute inset-0 ${placeholder}`}>
          Loading PayPal
        </p>
      )}
    </div>
  );
}

function PayIn({ roundId, s, onPaid }: { roundId: string; s: Settlement; onPaid: () => void }) {
  const { config, operator, asOperator } = useApp();
  const sandbox = config?.paypalMode === "sandbox" && !!paypalOptions.clientId;
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

  return (
    <div className="w-full space-y-2 sm:max-w-sm">
      {!config ? (
        <p role="status" className={placeholder}>
          Loading payment
        </p>
      ) : config.paypalMode === "simulated" ? (
        <button type="button" className={`${btn.primary} w-full sm:w-auto`} disabled={busy} onClick={paySimulated}>
          {busy ? "Paying..." : `Pay ${formatUsd(s.amountCents)} (simulated)`}
        </button>
      ) : !sandbox ? (
        <p className="text-sm text-red-700">The PayPal button needs NEXT_PUBLIC_PAYPAL_CLIENT_ID.</p>
      ) : !operator.signedIn ? (
        // Sandbox orders need the operator session. After the sign-in, the PayPal buttons show.
        <button type="button" className={`${btn.primary} w-full sm:w-auto`} onClick={() => asOperator(() => {})}>
          Sign in to pay {formatUsd(s.amountCents)}
        </button>
      ) : (
        <PayPalScriptProvider options={paypalOptions}>
          <SandboxButtons
            style={{ layout: "horizontal", height: 48, tagline: false, shape: "pill", color: "blue" }}
            createOrder={createOrder}
            onApprove={(data) => capture(data.orderID).catch((e) => setError(e as Error))}
            onError={(e) => setError(new Error(String(e?.message ?? "PayPal error")))}
          />
        </PayPalScriptProvider>
      )}
      {error && <ErrorNote error={error} />}
    </div>
  );
}

// The trader's own headline: "You settle $650 of debt with $170".
function traderTitle(r: Round, me: Settlement | undefined): string {
  const { grossCents, cashMovedCents } = r.result.stats;
  const done = r.status === "done";
  if (grossCents === 0) return "You have no debt in this round";
  const settle = `${done ? "You settled" : "You settle"} ${formatUsd(grossCents)} of debt`;
  if (me?.direction === "pay_out") return `${settle} and ${done ? "received" : "receive"} ${formatUsd(cashMovedCents)}`;
  return cashMovedCents === 0 ? `${settle} with no payment` : `${settle} with ${formatUsd(cashMovedCents)}`;
}

export function RoundView({ id }: { id: string }) {
  const { traderId, setTraderId, name, isHouse, operator, asOperator } = useApp();
  const round = useApi<Round>(`/api/rounds/${id}`);
  const { set, reload } = round;
  // The round was loaded for another viewer ("View as" changed): load it again before it shows.
  const stale = !!round.data && (round.data.privacy?.viewer ?? HOUSE) !== traderId;
  useEffect(() => {
    if (stale) reload();
  }, [stale, reload]);
  const [hover, setHover] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<Error | null>(null);

  const roundId = round.data?.id;
  const status = round.data?.status;

  // Payouts are sent: ask the server every 3 s until PayPal confirms them. The answer is the round as this viewer sees it.
  // The refresh is an operator action: without the sign-in in sandbox mode, the round waits.
  const canRefresh = !operator.needed || operator.signedIn;
  useEffect(() => {
    if (status !== "paying" || !roundId || !canRefresh) return;
    const timer = setInterval(() => {
      api<Round>(`/api/rounds/${roundId}/payout/refresh`, {}).then(set, (e) => setActionError(e as Error));
    }, 3000);
    return () => clearInterval(timer);
  }, [status, roundId, set, canRefresh]);

  if (round.error?.status === 404) {
    return (
      <div className="space-y-6">
        <GuideTip topic="payments" />
        <Empty title="No clearing round yet">
          {isHouse ? (
            <>
              <Link href="/" className="font-medium text-accent underline">
                Go to the market
              </Link>{" "}
              and run clearing.
            </>
          ) : (
            "The clearing house runs clearing. Your result shows here after it."
          )}
        </Empty>
      </div>
    );
  }
  if (round.error) return <ErrorNote error={round.error} onRetry={reload} />;
  if (!round.data || stale) return <Loading />;

  const r = round.data;
  const { stats, cancellations } = r.result;
  const payIns = r.settlements.filter((s) => s.direction === "pay_in");
  const payOuts = r.settlements.filter((s) => s.direction === "pay_out");
  const paidIn = payIns.filter((s) => s.status === "captured");
  const allPaidIn = paidIn.length === payIns.length;
  const canSendPayouts = allPaidIn && payOuts.some((s) => s.status === "none") && r.status !== "paying" && r.status !== "done";
  const active = hover ?? selected;
  const circle = (path: string[]) => [...path, path[0]].map(name).join(" → ");
  const others = r.privacy?.otherPayments;
  const othersLeft = others ? others.total - others.done : 0;

  // What the current trader owed and was owed before the round, and what is left to pay or receive.
  const me = r.settlements.find((s) => s.traderId === traderId);
  const owed = sum(r.debtsBefore.filter((e) => e.debtorId === traderId));
  const owedToMe = sum(r.debtsBefore.filter((e) => e.creditorId === traderId));
  const facts = `You owed ${formatUsd(owed)}. You were owed ${formatUsd(owedToMe)}.`;

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
          <TraderChip id={s.traderId} name={name(s.traderId)} />
          <span className="w-14 text-sm font-medium text-zinc-900">{name(s.traderId)}</span>
          <span className="w-16 text-sm tabular-nums text-zinc-900">{formatUsd(s.amountCents)}</span>
          <Badge tone={badge.tone}>{badge.text}</Badge>
        </div>
        {s.direction === "pay_in" && s.status !== "captured" && s.traderId !== traderId && (
          <button type="button" className={btn.small} onClick={() => setTraderId(s.traderId)}>
            Switch to {name(s.traderId)} to pay
          </button>
        )}
      </li>
    );
  };

  // The current trader's own part, for the finished round.
  const myResult = isHouse
    ? "Round settled"
    : me?.direction === "pay_in"
      ? `You paid ${formatUsd(me.amountCents)}`
      : me?.direction === "pay_out"
        ? `You received ${formatUsd(me.amountCents)}`
        : "Nothing to pay";

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          isHouse
            ? `${formatUsd(stats.grossCents)} of debt ${r.status === "done" ? "settled" : "to settle"} with ${formatUsd(stats.cashMovedCents)}`
            : traderTitle(r, me)
        }
      />

      {/* Phone: the replay first, above the fold, then the pay card, the details and the tip.
          Desktop: the pay card, the details and the tip left, the replay right. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-10">
        <ClearingReplay round={r} highlight={active === null ? undefined : cancellations[active]?.path} />

        <div className="min-w-0 space-y-6 lg:order-first">
          <Card className="min-w-0">
            <div className="min-w-0 space-y-4">
              {r.status === "done" ? (
                <div role="status" className="space-y-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 fill-current">
                      <path d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm4.1 6.3-4.9 5.4a.9.9 0 0 1-1.3 0L5.9 11a.9.9 0 1 1 1.3-1.2l1.4 1.5 4.2-4.7a.9.9 0 1 1 1.3 1.2Z" />
                    </svg>
                    Done
                  </p>
                  <p className="text-3xl font-medium leading-tight tracking-tight tabular-nums text-brand">{myResult}</p>
                  {isHouse && (
                    <p className="text-sm text-zinc-600">
                      {payIns.length} paid in, {payOuts.length} paid out
                    </p>
                  )}
                  <div className="replay-actions grid grid-cols-2 gap-2 pt-2">
                    <Link href={isHouse ? "/finance" : "/statement"} className={btn.primary}>
                      {isHouse ? "Open Finance" : "Read statement"}
                    </Link>
                    <Link href="/" className={btn.secondary}>
                      Market
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  {isHouse ? (
                    <p className="eyebrow text-zinc-500">Pay-ins</p>
                  ) : me?.direction === "pay_in" ? (
                    <>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="eyebrow text-zinc-500">You pay once</p>
                        <Link href="/statement" className="text-sm font-medium text-accent hover:underline">
                          Why {formatUsd(me.amountCents)}?
                        </Link>
                      </div>
                      <CountUp cents={me.amountCents} className="block text-4xl font-medium leading-none tracking-tight tabular-nums text-brand" />
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
                      <CountUp cents={me.amountCents} className="block text-4xl font-medium leading-none tracking-tight tabular-nums text-brand" />
                      {me.status !== "none" && (
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

                  {/* House: who paid in. Trader: only a count of the other pay-ins, no names. */}
                  {!isHouse && !!others?.total && r.status !== "paying" && (
                    <p className="text-sm text-zinc-600">
                      {othersLeft > 0 ? `${othersLeft} other ${othersLeft === 1 ? "trader" : "traders"} still to pay` : "Every other trader has paid in."}
                    </p>
                  )}
                  {isHouse && payIns.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
                      <ul className="flex gap-1.5">
                        {payIns.map((s) => {
                          const paid = s.status === "captured";
                          const text = `${name(s.traderId)}: ${paid ? "paid in" : "not paid in"}`;
                          const chip = <TraderChip id={s.traderId} name={name(s.traderId)} label={text} />;
                          // Paid: full chip with a check mark. Not paid: faded chip. The text says it for screen readers.
                          // Another trader not paid in: the chip switches the view to that trader, to pay.
                          return (
                            <li key={s.traderId} title={text} className="relative flex">
                              {paid || s.traderId === traderId ? (
                                <span className={`flex ${paid ? "" : "opacity-40"}`}>{chip}</span>
                              ) : (
                                <button
                                  type="button"
                                  aria-label={`Switch to ${name(s.traderId)} to pay`}
                                  className="flex rounded-full opacity-40 hover:opacity-100 focus-visible:opacity-100"
                                  onClick={() => setTraderId(s.traderId)}
                                >
                                  {chip}
                                </button>
                              )}
                              {paid && (
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 12 12"
                                  className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-emerald-700 fill-none stroke-white stroke-2 p-0.5 ring-2 ring-white"
                                >
                                  <path d="M2.5 6.2 5 8.5l4.5-5" />
                                </svg>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      <span>
                        {paidIn.length} of {payIns.length} paid in
                      </span>
                    </div>
                  )}

                  {r.status === "paying" ? (
                    <p role="status" className="text-sm text-zinc-700">
                      Payouts sent. Waiting for PayPal to confirm them...
                    </p>
                  ) : !isHouse ? (
                    <p className="text-sm text-zinc-600">The clearing house sends the payouts when everyone has paid.</p>
                  ) : (
                    canSendPayouts && (
                      <button type="button" className={`${btn.primary} w-full sm:w-auto`} disabled={sending} onClick={() => asOperator(sendPayouts)}>
                        {sending ? "Sending payouts..." : "Send payouts"}
                      </button>
                    )
                  )}
                </>
              )}
              {actionError && <ErrorNote error={actionError} />}
            </div>
          </Card>

          <details className="border-t border-zinc-200 pt-4">
            <summary className="cursor-pointer text-sm font-medium text-accent">Circles and payment plan</summary>
            <div className="mt-6 space-y-6">
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
                          {isHouse ? (
                            <>
                              {circle(c.path)}: <span className="font-semibold tabular-nums">{formatUsd(c.amountCents)}</span> cancelled
                            </>
                          ) : (
                            <>
                              A circle of {circleSize(c)} traders: <span className="font-semibold tabular-nums">{formatUsd(c.amountCents)}</span> off
                              each of your debts
                            </>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {!isHouse ? (
                <Card title="Your payment">
                  {me ? (
                    <ul className="divide-y divide-zinc-200">{row(me)}</ul>
                  ) : (
                    <p className="text-sm text-zinc-600">You pay nothing and receive nothing in this round.</p>
                  )}
                </Card>
              ) : (
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
              )}
            </div>
          </details>
          <GuideTip topic="payments" />
        </div>
      </div>
    </div>
  );
}
