"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Debt } from "@/lib/types";
import { waitingFor } from "./api";
import { useApp } from "./app";
import { CountUp } from "./count-up";

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

// Market page "Today" row: three numbers. The hero shows what clearing would cancel and the cash it needs.
export function Rhythm({ debts }: { debts?: Debt[] }) {
  const { traderId } = useApp();
  const list = debts ?? [];
  const waiting = list.filter((d) => waitingFor(d, traderId)).length;
  const ready = list.filter((d) => d.status === "confirmed").reduce((sum, d) => sum + d.remainingCents, 0);

  return (
    <section aria-labelledby="today-title" className="grid gap-3">
      <h2 id="today-title" className="eyebrow text-zinc-500">Today</h2>
      <div className="beats">
        <Beat value={debts ? list.filter((d) => isToday(d.createdAt)).length : "..."} label="added today" />
        <Beat value={debts ? waiting : "..."} label="waiting for you" href="/confirm" now={waiting > 0} />
        <Beat value={debts ? <CountUp cents={ready} /> : "..."} label="ready to clear" href="#ledger" />
      </div>
    </section>
  );
}
