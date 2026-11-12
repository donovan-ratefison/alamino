"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Activity, ClearingStats, Debt, Round, Settlement, TraderId } from "@/lib/types";
import { api, ApiError, formatUsd, type useApi } from "./api";
import { useApp } from "./app";
import { CountUp } from "./count-up";
import { traderColor } from "./trader-chip";
import { Badge, btn, Card, ErrorNote, Loading, Stat } from "./ui";

type Tone = Parameters<typeof Badge>[0]["tone"];

function Dot({ id }: { id: TraderId }) {
  return <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full" style={{ background: traderColor(id) }} />;
}

function Name({ id }: { id: TraderId }) {
  const { name } = useApp();
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Dot id={id} />
      <span className="truncate">{name(id)}</span>
    </span>
  );
}

function debtStatus(d: Debt, name: (id: string) => string): [string, Tone] {
  if (d.status === "confirmed") return ["Confirmed", "green"];
  if (d.status === "disputed") return ["Disputed", "red"];
  if (!d.debtorOk && !d.creditorOk) return ["Waiting for both", "amber"];
  return [`Waiting for ${name(d.debtorOk ? d.creditorId : d.debtorId)}`, "amber"];
}

function paymentStatus(s: Settlement): [string, Tone] {
  if (s.direction === "pay_in" && s.status === "captured") return ["Paid", "green"];
  if (s.direction === "pay_out" && s.status === "confirmed") return ["Received", "green"];
  return ["Waiting", "amber"];
}

// The debts that can still go into a round, newest first.
function DebtTable({ debts }: { debts: Debt[] }) {
  const { name } = useApp();
  const open = debts.filter((d) => d.status === "proposed" || d.status === "disputed" || d.status === "confirmed").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (open.length === 0) return <p className="py-8 text-center text-sm text-zinc-500">No debts to clear yet.</p>;
  return (
    <table className="house-table" aria-label="Debts for the next round">
      <thead>
        <tr>
          <th scope="col" className="text-left">Debtor</th>
          <th scope="col" className="text-left">Creditor</th>
          <th scope="col" className="text-right">Amount</th>
          <th scope="col" className="text-left">Status</th>
        </tr>
      </thead>
      <tbody>
        {open.map((d) => {
          const [text, tone] = debtStatus(d, name);
          return (
            <tr key={d.id} className="house-fade">
              <td><Name id={d.debtorId} /></td>
              <td><Name id={d.creditorId} /></td>
              <td className="text-right font-semibold tabular-nums">{formatUsd(d.remainingCents)}</td>
              <td><Badge tone={tone}>{text}</Badge></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// The net plan: one row per trader, the pay-ins first.
function Plan({ round }: { round: Round }) {
  const rows = [...round.settlements].sort((a, b) => (a.direction === b.direction ? 0 : a.direction === "pay_in" ? -1 : 1));
  return (
    <ul aria-label="Net plan" className="divide-y divide-[#e8eef7]">
      {rows.map((s) => {
        const [text, tone] = paymentStatus(s);
        return (
          <li key={s.direction + s.traderId} className="house-fade grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-2 py-3 text-sm sm:gap-x-4">
            <Name id={s.traderId} />
            <span className="text-zinc-500">{s.direction === "pay_in" ? "Pays in" : "Receives"}</span>
            <span className="text-base font-semibold tabular-nums">{formatUsd(s.amountCents)}</span>
            <span className="justify-self-end"><Badge tone={tone}>{text}</Badge></span>
          </li>
        );
      })}
    </ul>
  );
}

function PayInBar({ round }: { round: Round }) {
  const payIns = round.settlements.filter((s) => s.direction === "pay_in");
  const total = payIns.reduce((sum, s) => sum + s.amountCents, 0);
  const done = payIns.filter((s) => s.status === "captured").reduce((sum, s) => sum + s.amountCents, 0);
  return (
    <div className="mt-4 flex items-center gap-3 border-t border-[#e8eef7] pt-4 text-xs text-zinc-500">
      <span className="shrink-0">Pay-ins captured</span>
      <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-[#e8eef7]">
        <span className="block h-full rounded-full bg-emerald-600 transition-[width] duration-700" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </span>
      <span className="shrink-0 font-semibold text-[#052969] tabular-nums">
        {formatUsd(done)} of {formatUsd(total)}
      </span>
    </div>
  );
}

// Splits the text on the trader names and puts each name in bold. No HTML is parsed.
function Bold({ text, names }: { text: string; names: RegExp | null }) {
  if (!names) return <>{text}</>;
  return <>{text.split(names).map((part, i) => (i % 2 ? <strong key={i} className="font-semibold">{part}</strong> : part))}</>;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

// Polls the activity log every 3 s while the tab is visible. Calls `onNew` when rows arrive after the first load.
function ActivityFeed({ onNew }: { onNew: () => void }) {
  const { traders } = useApp();
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const onNewRef = useRef(onNew);
  useEffect(() => {
    onNewRef.current = onNew;
  });

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    let last = 0;
    let loaded = false;
    async function poll() {
      if (document.visibilityState === "visible") {
        try {
          const fresh = await api<Activity[]>(`/api/activity?after=${last}`);
          if (!live) return;
          setError(null);
          if (fresh.length > 0) {
            last = fresh[0].id;
            // A demo reset (from another device) starts a new log: drop the rows before it.
            const reset = fresh.findIndex((a) => a.kind === "demo_loaded");
            setRows((old) => (reset >= 0 ? fresh.slice(0, reset + 1) : [...fresh, ...(old ?? [])]).slice(0, 50));
            if (loaded) onNewRef.current();
          } else setRows((old) => old ?? []);
          loaded = true;
        } catch (e) {
          if (live) setError(e instanceof ApiError ? e : new ApiError(String(e), 0));
        }
      }
      if (live) timer = setTimeout(poll, 3000);
    }
    poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);

  const names = useMemo(() => {
    const list = traders.map((t) => t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return list.length ? new RegExp(`\\b(${list.join("|")})\\b`) : null;
  }, [traders]);

  return (
    <Card title="Live activity">
      {error && <div className="mb-3"><ErrorNote error={error} /></div>}
      {rows === null ? (
        error ? null : <Loading />
      ) : (
        <ul aria-live="polite" aria-label="Live activity" tabIndex={0} className="-my-3 max-h-[28rem] divide-y divide-[#e8eef7] overflow-y-auto">
          {rows.length === 0 && <li className="py-8 text-center text-sm text-zinc-500">No activity yet.</li>}
          {rows.map((a) => (
            <li key={a.id} className="house-fade grid grid-cols-[3rem_minmax(0,1fr)] gap-2 py-3 text-[13px] leading-5">
              <time dateTime={a.at} className="text-zinc-500 tabular-nums">{time(a.at)}</time>
              <span><Bold text={a.text} names={names} /></span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// The clearing house view of the market: 4 totals, the round, and the live activity.
export function HouseDashboard({
  total,
  stats: loaded,
  latest,
  running,
  onRun,
  runError,
}: {
  total: number; // sum of the confirmed debts
  stats: ClearingStats | null | undefined; // preview: what clearing would do now. null = nothing to clear
  latest: ReturnType<typeof useApi<Round>>;
  running: boolean;
  onRun: () => void;
  runError: Error | null;
}) {
  const { debts } = useApp();
  // Keep the last preview while a new one loads: the tiles count to the new values, they do not blink.
  const [kept, setKept] = useState(loaded);
  if (loaded !== undefined && loaded !== kept) setKept(loaded);
  const stats = loaded ?? kept;
  const round = latest.data;
  const open = round && round.status !== "done" ? round : null;
  // After a settled round, with nothing new to clear, show that round.
  const shown = open ?? (round && stats === null ? round : null);
  const k = shown ? shown.result.stats : stats;
  const money = (cents: number | undefined) => (cents === undefined ? (k === undefined ? "..." : "-") : <CountUp cents={cents} />);
  const shortId = (id: string) => id.replace(/^r-/, "").slice(0, 4);
  const caption = shown
    ? `Round ${shortId(shown.id)}${shown.status === "done" ? ", settled" : ""}`
    : stats === null
      ? "No confirmed debt to clear yet."
      : "If you run clearing now";

  return (
    <section aria-labelledby="house-title" className="market-section grid gap-6">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="house-title" className="eyebrow text-zinc-500">Clearing house</h2>
          <p className="text-xs text-zinc-500">{caption}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total debts" value={<CountUp cents={shown ? shown.result.stats.grossCents : total} />} />
          <Stat label="Cancelled, no cash" value={money(k?.clearedByCirclesCents)} />
          <Stat label="Cash to move" value={money(k?.cashMovedCents)} />
          <Stat label="Cash saved" value={k ? `${Math.round(k.savedPct)}%` : k === undefined ? "..." : "-"} />
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card
          title="Clearing round"
          actions={
            latest.loading ? null : open ? (
              <Link href={`/rounds/${open.id}`} className={btn.primary}>
                Continue round
              </Link>
            ) : (
              <button type="button" className={btn.primary} onClick={onRun} disabled={running || debts.loading || !stats}>
                {running ? "Running clearing..." : "Run clearing"}
              </button>
            )
          }
        >
          {runError && <div className="mb-4"><ErrorNote error={runError} /></div>}
          {latest.error && latest.error.status !== 404 && <div className="mb-4"><ErrorNote error={latest.error} onRetry={latest.reload} /></div>}
          {shown ? (
            <>
              <Plan round={shown} />
              <PayInBar round={shown} />
            </>
          ) : debts.error ? (
            <ErrorNote error={debts.error} onRetry={debts.reload} />
          ) : debts.data ? (
            <div className="-my-2 overflow-x-auto">
              <DebtTable debts={debts.data} />
            </div>
          ) : (
            <Loading />
          )}
        </Card>
        <ActivityFeed
          onNew={() => {
            debts.reload();
            latest.reload();
          }}
        />
      </div>
    </section>
  );
}
