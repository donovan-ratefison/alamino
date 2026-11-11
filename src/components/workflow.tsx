"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { ClearingStats, Debt } from "@/lib/types";
import { waitingFor } from "./api";
import { useApp } from "./app";
import { CountUp } from "./count-up";
import { ErrorNote } from "./ui";

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

// Market page "Today" row: five numbers. `stats` is undefined while loading and null when no debt is confirmed.
export function Rhythm({ debts, stats, statsError, onRetry }: { debts?: Debt[]; stats?: ClearingStats | null; statsError?: Error; onRetry: () => void }) {
  const { traderId } = useApp();
  const list = debts ?? [];
  const waiting = list.filter((d) => waitingFor(d, traderId)).length;
  const ready = list.filter((d) => d.status === "confirmed").reduce((sum, d) => sum + d.remainingCents, 0);
  const preview = (cents?: number) => (stats === undefined ? "..." : <CountUp cents={cents ?? 0} />);

  return (
    <div className="grid gap-4">
      <div className="beats">
        <Beat value={debts ? list.filter((d) => isToday(d.createdAt)).length : "..."} label="added today" />
        <Beat value={debts ? waiting : "..."} label="waiting for you" href="/confirm" now={waiting > 0} />
        <Beat value={debts ? <CountUp cents={ready} /> : "..."} label="ready to clear" href="#ledger" />
        <Beat value={preview(stats?.clearedByCirclesCents)} label="would cancel" />
        <Beat value={preview(stats?.cashMovedCents)} label="cash needed" />
      </div>
      {statsError && <ErrorNote error={statsError} onRetry={onRetry} />}
    </div>
  );
}
