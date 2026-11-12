"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import type { FinanceAccess, FinanceSnapshot, FinanceSource } from "@/lib/finance/types";
import { money, totals } from "@/lib/finance/metrics";
import { useApi } from "@/components/api";
import { useApp } from "@/components/app";
import { btn, Empty, ErrorNote, field, Loading, PageHeader } from "@/components/ui";

const Studio = dynamic(() => import("@/components/finance/studio"), { ssr: false, loading: () => <Loading text="Loading AG Studio…" /> });
const Transactions = dynamic(() => import("@/components/finance/transactions"), { ssr: false, loading: () => <Loading text="Loading transaction explorer…" /> });
const day = (date: Date) => date.toISOString().slice(0, 10);
const SOURCES: Record<FinanceSource, string> = { ledger: "Alamino ledger", demo: "Demonstration fixtures", sandbox: "PayPal Sandbox account" };
const fieldLabel = "min-w-0 flex-1 basis-36 text-xs font-medium text-slate-600";

// Own tile instead of ui Stat: Stat is too large for a 2 x 2 grid on a phone.
function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="min-w-0 rounded-[20px] border border-[#dce5f2] bg-white p-4 sm:p-6">
    <p className="text-2xl font-medium tracking-tight text-[#003087] tabular-nums [overflow-wrap:anywhere] sm:text-4xl">{value}</p>
    <p className="mt-2 text-sm font-medium text-zinc-800">{label}</p>
    <p className="mt-1 text-xs leading-5 text-zinc-500">{hint}</p>
  </div>;
}

export default function FinancePage() {
  const { operator, asOperator } = useApp();
  // The route ignores the query. It changes the path, so the access loads again after an operator sign-in or sign-out.
  const access = useApi<FinanceAccess>(`/api/finance/session?operator=${operator.signedIn}`);
  const [source, setSource] = useState<FinanceSource>("ledger");
  const [currency, setCurrency] = useState("USD");
  const [period, setPeriod] = useState(() => ({ start: day(new Date(Date.now() - 30 * 86400000)), end: day(new Date()) }));
  const [applied, setApplied] = useState(period);
  const [refresh, setRefresh] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const range = useMemo(() => {
    const now = new Date(clock);
    const endOfDay = new Date(`${applied.end}T23:59:59.999Z`);
    return { start: `${applied.start}T00:00:00.000Z`, end: new Date(Math.min(+now, +endOfDay)).toISOString() };
    // Refresh intentionally fixes a fresh, stable end time for this snapshot.
  }, [applied, clock]);
  const url = `/api/finance/data?${new URLSearchParams({ source, ...range, refresh: refresh > 0 ? "1" : "0" })}`;
  const snapshot = useApi<FinanceSnapshot>(source === "sandbox" && !access.data?.authenticated ? null : url);
  const currencies = [...new Set(snapshot.data?.transactions.map((t) => t.currency) ?? [])].sort();
  const activeCurrency = currencies.includes(currency) ? currency : currencies[0] ?? "USD";
  const rows = snapshot.data?.transactions.filter((t) => t.currency === activeCurrency) ?? [];
  const summary = totals(rows, activeCurrency);
  const format = (n: number) => money(n, activeCurrency);
  const days = Math.round((Date.parse(applied.end) - Date.parse(applied.start)) / 86400000);
  const periodText = applied.end === day(new Date(clock)) && days === 30 ? "last 30 days" : `${applied.start} to ${applied.end}`;
  const synced = snapshot.data?.syncedAt ? ` · retrieved ${new Date(snapshot.data.syncedAt).toISOString().slice(11, 16)} UTC` : "";
  const sandboxReady = !!access.data?.authenticated && !!access.data?.paypalConfigured;

  async function logout() {
    setBusy(true); setError(null);
    try {
      const result = await fetch("/api/finance/session", { method: "DELETE" });
      if (!result.ok) throw new Error((await result.json()).error);
      if (source === "sandbox") setSource("ledger");
      operator.reload();
    } catch (e) { setError(e as Error); }
    finally { setBusy(false); }
  }
  function apply(e: FormEvent) {
    e.preventDefault(); setError(null);
    const start = Date.parse(period.start), end = Date.parse(period.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end - start > 92 * 86400000 || period.end > day(new Date())) {
      setError(new Error("Choose up to 93 days, ending today or earlier.")); return;
    }
    setApplied({ ...period }); setClock(Date.now()); setRefresh(0);
  }

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <PageHeader title="AI Finance">
          <p>Money in and out of the Alamino clearing account.</p>
          <p className="mt-1 text-xs font-medium text-[#003087]">{SOURCES[source]} · {periodText} · {activeCurrency}{synced}</p>
        </PageHeader>
      </div>
      <button type="button" className={`${btn.secondary} shrink-0`} aria-expanded={settingsOpen} aria-controls="finance-settings" onClick={() => setSettingsOpen(!settingsOpen)}>Settings</button>
    </div>

    {settingsOpen && <section id="finance-settings" aria-label="Finance settings" className="space-y-4 rounded-[20px] border border-[#dce5f2] bg-[#f6f9fe] p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className={fieldLabel}>Data source<select value={source} onChange={(e) => { setSource(e.target.value as FinanceSource); setRefresh(0); }} className={`${field} mt-1`}>
          <option value="ledger">{SOURCES.ledger}</option>
          <option value="demo">{SOURCES.demo}</option>
          <option value="sandbox" disabled={!sandboxReady}>{SOURCES.sandbox}{sandboxReady ? "" : access.data?.authenticated ? " (credentials not configured)" : " (operator sign-in required)"}</option>
        </select></label>
        {access.data?.authenticated
          ? <button type="button" className={btn.small} onClick={logout} disabled={busy}>Sign out</button>
          : <button type="button" className={btn.small} onClick={() => asOperator(access.reload, true)}>Operator sign-in</button>}
      </div>
      <form onSubmit={apply} className="flex flex-wrap items-end gap-3">
        <label className={fieldLabel}>From (UTC)<input type="date" className={`${field} mt-1`} value={period.start} max={period.end} onChange={(e) => setPeriod({ ...period, start: e.target.value })} required /></label>
        <label className={fieldLabel}>To (UTC)<input type="date" className={`${field} mt-1`} value={period.end} max={day(new Date(clock))} min={period.start} onChange={(e) => setPeriod({ ...period, end: e.target.value })} required /></label>
        <label className={fieldLabel}>Currency<select className={`${field} mt-1`} value={activeCurrency} onChange={(e) => setCurrency(e.target.value)}>{(currencies.length ? currencies : ["USD"]).map((c) => <option key={c}>{c}</option>)}</select></label>
        <button className={btn.primary}>Apply period</button>
        <button type="button" className={btn.secondary} onClick={() => { setClock(Date.now()); setRefresh(1); }} disabled={snapshot.loading}>{snapshot.loading ? "Loading…" : "Refresh data"}</button>
      </form>
      {snapshot.data && <p className="text-xs leading-5 text-slate-500">{snapshot.data.warnings[0]} Amounts in different currencies are never added together.</p>}
      {access.error && <ErrorNote error={access.error} onRetry={access.reload} />}
    </section>}

    {error && <ErrorNote error={error} />}
    {snapshot.error ? <ErrorNote error={snapshot.error} onRetry={snapshot.reload} />
      : source === "sandbox" && !access.data?.authenticated ? <Empty title="Sign in to see the PayPal Sandbox account.">Open Settings and use Operator sign-in.</Empty>
      : !snapshot.data ? <Loading text="Loading financial data…" />
      : source === "ledger" && !snapshot.data.transactions.length ? <Empty title="No payment yet.">
        <p>Payments show here when traders pay in a clearing round. Run clearing on the market page, then pay in.</p>
        <Link href="/" className={`${btn.primary} mt-5`}>Go to the market page</Link>
      </Empty>
      : <>
        {snapshot.data.warnings.length > 1 && <ul role="status" className="space-y-1 text-xs leading-5 text-amber-800">{snapshot.data.warnings.slice(1).map((w) => <li key={w}>{w}</li>)}</ul>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Received" value={format(summary.received)} hint="Completed pay-ins. Not Alamino revenue." />
          <Kpi label="Paid out" value={format(summary.paidOut)} hint="Completed payments out, no refunds." />
          <Kpi label="Refunded" value={format(summary.refunded)} hint="Completed provider refunds." />
          <Kpi label="Pending / failed" value={`${summary.pending} / ${summary.failed}`} hint={`${summary.count} records in ${activeCurrency}`} />
        </div>
        <Studio key={`${source}:${activeCurrency}`} snapshot={snapshot.data} currency={activeCurrency} authenticated={!!access.data?.authenticated} />
        <Transactions rows={rows} />
      </>}
  </div>;
}
