"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { ClearingStats, Debt } from "@/lib/types";
import { formatUsd, waitingFor } from "./api";
import { useApp } from "./app";
import { ErrorNote } from "./ui";

const steps = [
  { lane: "Every day", label: "Add", detail: "A sentence or a photo.", href: "/add" },
  { lane: "Every day", label: "Confirm", detail: "Both sides agree.", href: "/confirm" },
  { lane: "Clearing day", label: "Clear", detail: "Circles cancel.", href: "/" },
  { lane: "Clearing day", label: "Settle", detail: "Pay only what remains.", href: "/rounds/latest" },
];

// Short link strip for the inner pages. `current` is the index of the current page.
export function Workflow({ current }: { current?: number }) {
  return (
    <ul className="workflow" aria-label="How Alamino works">
      {steps.map((step, i) => (
        <li key={step.label}>
          <Link href={step.href} aria-current={current === i ? "page" : undefined}>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{step.lane}</span>
            <span className="block text-sm font-medium text-brand">{step.label}</span>
            <span className="block text-xs leading-5 text-zinc-500">{step.detail}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Beat({ value, label, href, now }: { value: ReactNode; label: string; href?: string; now?: boolean }) {
  const content = (
    <>
      <span className="beat-value">{value}</span>
      <span className="beat-label">{label}</span>
    </>
  );
  const className = now ? "beat beat-now" : "beat";
  return href ? <Link href={href} className={className}>{content}</Link> : <div className={className}>{content}</div>;
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

// Market page band: what happens every day, and what clearing would do now.
// `stats` is undefined while loading and null when no debt is confirmed.
export function Rhythm({
  debts,
  stats,
  statsError,
  onRetry,
  clearing,
}: {
  debts?: Debt[];
  stats?: ClearingStats | null;
  statsError?: Error;
  onRetry: () => void;
  clearing: ReactNode;
}) {
  const { traderId } = useApp();
  const list = debts ?? [];
  const waiting = list.filter((d) => waitingFor(d, traderId)).length;
  const ready = list.filter((d) => d.status === "confirmed").reduce((sum, d) => sum + d.remainingCents, 0);
  const show = (value: string | number) => (debts ? value : "...");
  const preview = (cents?: number) => (stats === undefined ? "..." : formatUsd(cents ?? 0));

  return (
    <div className="rhythm">
      <section className="lane" aria-labelledby="lane-daily">
        <p id="lane-daily" className="eyebrow text-zinc-500">Every day</p>
        <div className="beats">
          <Beat value={show(list.filter((d) => isToday(d.createdAt)).length)} label="debts added today" />
          <Beat value={show(waiting)} label="wait for your answer" href="/confirm" now={waiting > 0} />
          <Beat value={show(formatUsd(ready))} label="confirmed, ready to clear" href="#ledger" />
        </div>
        <p className="text-sm text-zinc-500">Add and confirm repeat all week, in any order.</p>
      </section>
      <section className="lane" aria-labelledby="lane-clearing">
        <p id="lane-clearing" className="eyebrow text-zinc-500">Clearing day</p>
        {statsError ? (
          <ErrorNote error={statsError} onRetry={onRetry} />
        ) : stats === null ? (
          <p className="text-sm text-zinc-600">No confirmed debt to clear yet.</p>
        ) : (
          <div className="beats">
            <Beat value={preview(stats?.clearedByCirclesCents)} label="would cancel if it ran now" />
            <Beat value={preview(stats?.cashMovedCents)} label="is all the cash it needs" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {clearing}
          <p className="text-sm text-zinc-500">Then each trader pays or is paid, and reads a statement.</p>
        </div>
      </section>
    </div>
  );
}
