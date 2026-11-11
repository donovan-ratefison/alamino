"use client";

import { useState } from "react";
import type { Edge, Round, TraderId } from "@/lib/types";
import { formatUsd } from "./api";
import { useApp } from "./app";
import { Network } from "./network";
import { btn, Card } from "./ui";

interface Frame {
  edges: Edge[];
  highlight?: TraderId[];
  left: number;
  cancelled: number;
  caption: string;
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
const pair = (a: TraderId, b: TraderId) => `${a}>${b}`;
const dollars = (cents: number) => Math.round(cents / 100) * 100;

// The Before and After networks. "Replay clearing" plays each cancellation on the Before network.
export function ClearingReplay({ round, highlight }: { round: Round; highlight?: TraderId[] }) {
  const { traders, name } = useApp();
  const [frame, setFrame] = useState<Frame | null>(null);
  const [running, setRunning] = useState(false);
  const { stats, cancellations, remaining } = round.result;

  async function replay() {
    setRunning(true);
    const end: Frame = {
      edges: remaining,
      left: stats.remainingCents,
      cancelled: stats.clearedByCirclesCents,
      caption: `No circle is left. ${formatUsd(stats.remainingCents)} of debt is left. ${formatUsd(stats.clearedByCirclesCents)} cancelled, no money moved.`,
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(end);
      setRunning(false);
      return;
    }

    const amounts = new Map<string, Edge>();
    for (const e of round.debtsBefore) {
      const key = pair(e.debtorId, e.creditorId);
      amounts.set(key, { ...e, amountCents: (amounts.get(key)?.amountCents ?? 0) + e.amountCents });
    }
    let f: Frame = { edges: [...amounts.values()], left: stats.grossCents, cancelled: 0, caption: "Looking for circles" };
    const show = (next: Partial<Frame>) => setFrame((f = { ...f, ...next }));
    show({});
    await wait(700);

    for (const c of cancellations) {
      const circle = [...c.path, c.path[0]].map(name).join(" → ");
      show({ highlight: c.path, caption: `${circle}: ${formatUsd(c.amountCents)} cancels on each debt` });
      await wait(1100);
      c.path.forEach((id, i) => {
        const key = pair(id, c.path[(i + 1) % c.path.length]);
        const e = amounts.get(key);
        if (e) amounts.set(key, { ...e, amountCents: e.amountCents - c.amountCents });
      });
      show({ edges: [...amounts.values()] });

      // Count both numbers over 0.9 s, in whole dollars, then set the exact cents.
      const from = { left: f.left, cancelled: f.cancelled };
      const cut = c.amountCents * c.path.length;
      await new Promise<void>((done) => {
        const t0 = performance.now();
        const tick = (t: number) => {
          const k = Math.min(1, (t - t0) / 900);
          if (k < 1) {
            show({ left: dollars(from.left - cut * k), cancelled: dollars(from.cancelled + cut * k) });
            requestAnimationFrame(tick);
          } else {
            show({ left: from.left - cut, cancelled: from.cancelled + cut });
            done();
          }
        };
        requestAnimationFrame(tick);
      });
      await wait(500);
      show({ highlight: undefined });
    }

    await wait(600);
    setFrame(end);
    setRunning(false);
  }

  const left = frame?.left ?? stats.grossCents;
  const cancelled = frame?.cancelled ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btn.secondary} disabled={running} onClick={replay}>
          Replay clearing
        </button>
        {frame && (
          <p aria-live="polite" className="min-w-0 text-sm text-zinc-700">
            {frame.caption}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <dt className="text-xs text-zinc-500">Debt left</dt>
          <dd className="mt-1 text-2xl font-medium tabular-nums text-brand">{formatUsd(left)}</dd>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <dt className="text-xs text-zinc-500">Cancelled, no money moved</dt>
          <dd className="mt-1 text-2xl font-medium tabular-nums text-brand">{formatUsd(cancelled)}</dd>
        </div>
      </dl>

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          title={frame ? "Clearing replay" : "Before"}
          actions={
            frame ? (
              !running && (
                <button type="button" className={btn.small} onClick={() => setFrame(null)}>
                  Show before
                </button>
              )
            ) : (
              <span className="text-xs text-zinc-500">Select a circle to show it here</span>
            )
          }
        >
          {traders.length > 0 && (
            <Network
              traders={traders}
              edges={frame?.edges ?? round.debtsBefore}
              highlight={frame ? frame.highlight : highlight}
              label="Debts before the round"
            />
          )}
        </Card>
        <Card title="After circles cancel">
          {traders.length > 0 && <Network traders={traders} edges={remaining} label="Debts after circles cancel" />}
          {remaining.every((e) => e.amountCents === 0) && <p className="mt-3 text-sm text-zinc-600">No debt is left.</p>}
        </Card>
      </div>
    </div>
  );
}
