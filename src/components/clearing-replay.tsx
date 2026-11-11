"use client";

import { useEffect, useState } from "react";
import type { Edge, Round, TraderId } from "@/lib/types";
import { formatUsd } from "./api";
import { useApp } from "./app";
import { Network } from "./network";

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
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// One network of the round with a Before / After toggle. It rests on the final state.
// "Replay clearing" plays each cancellation on the same network. The first visit of a round in a session plays it once.
// `highlight` (a circle from the list) shows that circle on the Before view.
export function ClearingReplay({ round, highlight }: { round: Round; highlight?: TraderId[] }) {
  const { traders, name } = useApp();
  const [view, setView] = useState<"before" | "after">("after");
  const [frame, setFrame] = useState<Frame | null>(null); // the current replay frame
  const [running, setRunning] = useState(false);
  const { stats, cancellations, remaining } = round.result;
  const endCaption = `No circle left. ${formatUsd(stats.clearedByCirclesCents)} cancelled, no money moved.`;

  async function replay() {
    setView("after");
    if (reducedMotion()) return;
    setRunning(true);

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
    setRunning(false);
  }

  // Play once by itself on the first visit of this round in the session. The key is set when the replay starts,
  // so a double effect run in development does not cancel it. Without storage, the page rests on the final state.
  const roundId = round.id;
  useEffect(() => {
    const key = `alamino-replayed-${roundId}`;
    try {
      if (sessionStorage.getItem(key) || reducedMotion()) return;
    } catch {
      return;
    }
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(key, "1");
      } catch {}
      replay();
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  const before = !running && (view === "before" || !!highlight);
  const edges = running && frame ? frame.edges : before ? round.debtsBefore : remaining;
  const left = running && frame ? frame.left : stats.remainingCents;
  const cancelled = running && frame ? frame.cancelled : stats.clearedByCirclesCents;
  const toggle = (v: "before" | "after", text: string) => {
    const pressed = !running && (v === "before") === before;
    return (
      <button
        type="button"
        aria-pressed={pressed}
        disabled={running}
        onClick={() => setView(v)}
        className={`h-8 rounded-full px-3 text-xs font-medium disabled:opacity-60 ${
          pressed ? "bg-white text-brand shadow-sm" : "text-zinc-600 hover:text-brand"
        }`}
      >
        {text}
      </button>
    );
  };

  return (
    <div className="replay min-w-0 space-y-4">
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5">
          <dt className="whitespace-nowrap text-[11px] text-zinc-500">Debt left</dt>
          <dd className="mt-0.5 text-xl font-medium tabular-nums text-brand">{formatUsd(left)}</dd>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5">
          <dt className="whitespace-nowrap text-[11px] text-zinc-500">Cancelled</dt>
          <dd className="mt-0.5 text-xl font-medium tabular-nums text-brand">{formatUsd(cancelled)}</dd>
        </div>
      </dl>

      {traders.length > 0 && (
        <div className="relative">
          <div role="group" aria-label="Network view" className="absolute left-3 top-3 z-10 inline-flex rounded-full border border-zinc-200 bg-zinc-50 p-0.5">
            {toggle("before", "Before")}
            {toggle("after", "After")}
          </div>
          <button
            type="button"
            aria-label="Replay clearing"
            title="Replay clearing"
            className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full border border-zinc-200 bg-white text-brand hover:bg-blue-50 disabled:opacity-45"
            disabled={running}
            onClick={replay}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 fill-none stroke-current stroke-2">
              <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.2h-3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Network
            traders={traders}
            edges={edges}
            highlight={running ? frame?.highlight : before ? highlight : undefined}
            circles={before && !highlight ? cancellations.map((c) => c.path) : undefined}
            interactive={!running}
            label={running ? "Debts during the clearing replay" : before ? "Debts before the round" : "Debts after circles cancel"}
          />
        </div>
      )}
      <p aria-live="polite" className="min-h-10 text-sm text-zinc-700">
        {running && frame
          ? frame.caption
          : !before
            ? endCaption
            : highlight
              ? "The selected circle is in blue."
              : "Green debts form circles. Circles cancel with no money."}
      </p>
    </div>
  );
}
