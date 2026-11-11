"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type FormEvent } from "react";
import type { FinanceAccess, FinanceSnapshot, FinanceSource } from "@/lib/finance/types";
import { currencyDigits, money, totals } from "@/lib/finance/metrics";
import { useApi } from "@/components/api";
import { btn, Card, ErrorNote, field, Loading, Stat } from "@/components/ui";

const Studio = dynamic(() => import("@/components/finance/studio"), { ssr: false, loading: () => <Loading text="Loading AG Studio…" /> });
const Transactions = dynamic(() => import("@/components/finance/transactions"), { ssr: false, loading: () => <Loading text="Loading transaction explorer…" /> });
const day = (date: Date) => date.toISOString().slice(0, 10);

export default function FinancePage() {
  const access = useApi<FinanceAccess>("/api/finance/session");
  const [source, setSource] = useState<FinanceSource>("demo");
  const [currency, setCurrency] = useState("USD");
  const [period, setPeriod] = useState(() => ({ start: day(new Date(Date.now() - 30 * 86400000)), end: day(new Date()) }));
  const [applied, setApplied] = useState(period);
  const [refresh, setRefresh] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [showLogin, setShowLogin] = useState(false);
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

  async function login(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const result = await fetch("/api/finance/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!result.ok) throw new Error((await result.json()).error);
      setPassword(""); setShowLogin(false); access.reload();
    } catch (e) { setError(e as Error); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError(null);
    try {
      const result = await fetch("/api/finance/session", { method: "DELETE" });
      if (!result.ok) throw new Error((await result.json()).error);
      setSource("demo"); access.reload();
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

  return <div className="finance-page space-y-7">
    <section className="finance-hero bleed brand-band">
      <div className="band-content">
        <div className="flex flex-wrap items-start justify-between gap-5"><p className="eyebrow text-blue-100">Alamino / AI Finance Dashboard</p><span className="rounded-full border border-white/40 px-3 py-1.5 text-[10px] font-semibold tracking-wide">{source === "demo" ? "DEMO DATA · NOT REAL PAYMENTS" : "PAYPAL SANDBOX · TEST MONEY"}</span></div>
        <h1 className="display-title mt-6">Your money.<br />A clearer picture.</h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-blue-50">Understand what comes in, what goes out, and what&apos;s still to settle. Your financial workspace, shaped around your market.</p>
        <div className="mt-8 flex flex-wrap gap-3"><a href="#financial-workspace" className={btn.inverse}>Explore your dashboard <span aria-hidden="true">↗</span></a><a href="#transaction-explorer" className={btn.outlineOnBlue}>View transactions</a></div>
        <div className="mt-7 flex flex-wrap items-center gap-4 text-xs text-blue-100"><span>AG Studio dashboards</span><span aria-hidden="true">·</span><span>AG Grid explorer</span><span aria-hidden="true">·</span><span>{access.data?.authenticated && access.data.aiConfigured ? "AI model configured · verified on request" : "Financial assistant · fallback mode"}</span></div>
      </div>
    </section>

    <Card title="Data connection" actions={access.data?.authenticated ? <button className={btn.small} onClick={logout} disabled={busy}>Sign out</button> : <button className={btn.small} onClick={() => setShowLogin(!showLogin)}>{showLogin ? "Close sign-in" : "Admin sign-in"}</button>}>
      <div className="flex flex-wrap items-center gap-3"><label htmlFor="finance-source" className="text-sm font-medium">Data source</label><select id="finance-source" value={source} onChange={(e) => { setSource(e.target.value as FinanceSource); setRefresh(0); }} className={`${field} max-w-xs`}><option value="demo">Demonstration fixtures</option><option value="sandbox" disabled={!access.data?.authenticated || !access.data?.paypalConfigured}>PayPal Sandbox account</option></select>
        <p className="text-xs text-slate-500">{access.data?.authenticated ? access.data.paypalConfigured ? "Admin session active. Sandbox credentials are configured." : "Admin session active. Add PayPal Sandbox credentials to connect." : "Demo is public. Sign in to access the Sandbox account and live AI."}</p></div>
      {access.error && <div className="mt-3"><ErrorNote error={access.error} onRetry={access.reload} /></div>}
      {showLogin && <form onSubmit={login} className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4"><label className="text-xs text-slate-500">Finance admin password<input type="password" autoComplete="current-password" className={`${field} mt-1`} value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={256} /></label><button className={btn.primary} disabled={busy || !password}>{busy ? "Signing in…" : "Sign in"}</button>{access.data && !access.data.passwordConfigured && <p className="max-w-md text-xs text-amber-800">Set FINANCE_ADMIN_PASSWORD (at least 16 characters) on the server. Never use PayPal credentials as this password.</p>}</form>}
    </Card>

    <form onSubmit={apply} className="finance-filter">
      <label className="text-xs font-medium text-slate-600">From (UTC)<input type="date" className={`${field} mt-1`} value={period.start} max={period.end} onChange={(e) => setPeriod({ ...period, start: e.target.value })} required /></label>
      <label className="text-xs font-medium text-slate-600">To (UTC)<input type="date" className={`${field} mt-1`} value={period.end} max={day(new Date(clock))} min={period.start} onChange={(e) => setPeriod({ ...period, end: e.target.value })} required /></label>
      <label className="text-xs font-medium text-slate-600">Currency<select className={`${field} mt-1`} value={activeCurrency} onChange={(e) => setCurrency(e.target.value)}>{(currencies.length ? currencies : ["USD"]).map((c) => <option key={c}>{c}</option>)}</select></label>
      <button className={btn.primary}>Apply period</button><button type="button" className={btn.secondary} onClick={() => { setClock(Date.now()); setRefresh(1); }} disabled={snapshot.loading}>{snapshot.loading ? "Loading…" : "Refresh data"}</button>
    </form>
    {error && <ErrorNote error={error} />}
    {snapshot.error ? <ErrorNote error={snapshot.error} onRetry={snapshot.reload} /> : !snapshot.data ? <Loading text="Loading financial data…" /> : <>
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 text-xs leading-6 text-brand" role="status"><ul className="list-inside list-disc">{snapshot.data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>{snapshot.data.syncedAt && <p className="mt-2 font-medium">Last retrieval: {new Date(snapshot.data.syncedAt).toISOString().replace("T", " ").slice(0, 19)} UTC</p>}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Completed receipts" value={format(summary.received)} hint="Clearing funds · not Alamino revenue" /><Stat label="Completed outgoing payments" value={format(summary.paidOut)} hint="Outgoing payments, excluding refunds" /><Stat label="Completed outgoing refunds" value={format(summary.refunded)} hint="Provider refund records only" /><Stat label="Pending / failed records" value={`${summary.pending} / ${summary.failed}`} hint={`${summary.count} records · ${activeCurrency}`} /></div>
      <p className="text-xs leading-5 text-slate-500">Amounts are never added across currencies. Revenue Analytics measures clearing receipts; no Alamino commission income is recorded. Charts use major currency units ({currencyDigits(activeCurrency)} decimal places). Debt Tracker shows the local USD demo ledger independently of the transaction date filter. Studio and table filters apply within their own workspace.</p>
      <Studio key={`${source}:${activeCurrency}`} snapshot={snapshot.data} currency={activeCurrency} authenticated={!!access.data?.authenticated} />
      <Transactions rows={rows} />
    </>}
  </div>;
}
