"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, type ColDef } from "ag-grid-community";
import type { ClearingStats, Debt, Round } from "@/lib/types";
import { api, formatUsd, useApi } from "@/components/api";
import { useApp } from "@/components/app";
import { Network } from "@/components/network";
import { Badge, btn, Card, Empty, ErrorNote, Loading } from "@/components/ui";
import { Rhythm } from "@/components/workflow";
import { financeGridTheme } from "@/components/finance/theme";
import { GuideTip } from "@/components/guide-tip";

ModuleRegistry.registerModules([AllCommunityModule]);

const money = { valueFormatter: (p: { value: number }) => formatUsd(p.value), type: "rightAligned", minWidth: 110, flex: 1 };

export default function MarketPage() {
  const router = useRouter();
  const { traders, name, debts } = useApp();
  const latest = useApi<Round>("/api/rounds/latest");
  const [busy, setBusy] = useState<"run" | "reset" | null>(null);
  const [runError, setRunError] = useState<Error | null>(null);
  const [resetError, setResetError] = useState<Error | null>(null);

  const confirmed = (debts.data ?? []).filter((d) => d.status === "confirmed");
  const total = confirmed.reduce((sum, d) => sum + d.remainingCents, 0);
  // The route ignores the query. It changes the path, so the preview loads again when the confirmed debts change.
  const preview = useApi<{ stats: ClearingStats | null }>(debts.data ? `/api/rounds/preview?v=${confirmed.length}-${total}` : null);
  const openRound = latest.data && latest.data.status !== "done" ? latest.data : null;

  async function runClearing() {
    setBusy("run");
    setRunError(null);
    try {
      const round = await api<Round>("/api/rounds", {});
      router.push(`/rounds/${round.id}`);
    } catch (e) {
      setRunError(e as Error);
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    setResetError(null);
    setRunError(null);
    try {
      await api("/api/demo/reset", {});
      debts.reload();
      latest.reload();
    } catch (e) {
      setResetError(e as Error);
    }
    setBusy(null);
  }

  const columns: ColDef<Debt>[] = [
    { headerName: "Debtor", valueGetter: (p) => name(p.data?.debtorId), minWidth: 100, flex: 1 },
    { headerName: "Creditor", valueGetter: (p) => name(p.data?.creditorId), minWidth: 100, flex: 1 },
    { headerName: "Amount", field: "amountCents", ...money },
    { headerName: "Remaining", field: "remainingCents", ...money },
    { headerName: "Note", field: "note", minWidth: 180, flex: 2 },
    { headerName: "Status", field: "status", minWidth: 110, flex: 1 },
    { headerName: "Source", field: "source", minWidth: 90, flex: 1 },
  ];

  return (
    <div>
      <section className="bleed brand-band market-hero">
        <div className="band-content">
          <div>
            <p className="eyebrow text-blue-100 max-sm:hidden">Your market. More connected.</p>
            <h1 className="display-title mt-6">Less to pay.<br />More to grow.</h1>
            <p className="mt-2 text-base leading-6 sm:hidden">Clear the circles. Pay only what remains.</p>
            <p className="mt-6 max-w-md text-base leading-7 text-blue-50 max-sm:hidden sm:text-lg">Turn everyday debts into a simpler settlement. Capture with AI, clear the circles, and pay the rest with PayPal.</p>
            <div className="mt-8 flex flex-wrap gap-3 max-sm:hidden"><Link href="/add" className={btn.inverse}>Add a debt <span aria-hidden="true">↗</span></Link><Link href="/finance" className={btn.outlineOnBlue}>Explore AI Finance</Link></div>
            <p className="mt-6 text-xs leading-6 text-blue-100 max-sm:hidden">Both sides confirm. The engine calculates. You stay in control.</p>
          </div>
          <div className="hero-snapshot max-sm:hidden">
            <div className="hero-snapshot-title"><p className="text-sm font-medium">Your market, at a glance</p><span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 10a8 8 0 0 1 14-5l2 2M20 3v4h-4M20 14A8 8 0 0 1 6 19l-2-2M4 21v-4h4" /></svg></span></div>
            <p className="snapshot-value">{debts.loading || debts.error ? "..." : formatUsd(total)}</p>
            <p className="mt-3 text-xs text-zinc-500">Total confirmed debts · USD</p>
            <div className="snapshot-grid"><div><p className="text-3xl font-medium tracking-tight">{debts.loading || debts.error ? "..." : confirmed.length}</p><p className="mt-2 text-xs text-zinc-500">Confirmed debts</p></div><div><p className="text-3xl font-medium tracking-tight">{traders.length || "..."}</p><p className="mt-2 text-xs text-zinc-500">Connected traders</p></div></div>
            <div className="mt-7 flex items-center gap-3"><div className="flex -space-x-2">{traders.slice(0, 5).map((t, i) => <span key={t.id} title={t.name} className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-xs font-semibold ${i % 2 === 0 ? "bg-brand text-white" : "bg-blue-100 text-brand"}`}>{t.name[0]}</span>)}</div><span className="text-xs leading-5 text-zinc-500">One market.<br />A shared way forward.</span></div>
          </div>
        </div>
      </section>

      <section className="market-section space-y-4">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4 max-sm:mb-4"><div><p className="eyebrow text-accent">The market rhythm</p><h2 className="section-title mt-3">Every day, then clearing day.</h2></div><p className="max-w-xs text-sm leading-6 text-zinc-500 max-sm:hidden">Debts come in all week. One clearing cancels the circles and settles the rest.</p></div>
        <Rhythm
          debts={debts.data}
          stats={preview.data?.stats}
          statsError={preview.error}
          onRetry={preview.reload}
          clearing={latest.loading ? null : openRound ? (
            <Link href={`/rounds/${openRound.id}`} className={btn.primary}>
              Continue round
            </Link>
          ) : (
            <button type="button" className={btn.primary} onClick={runClearing} disabled={busy !== null || debts.loading}>
              {busy === "run" ? "Running clearing..." : "Run clearing"}
            </button>
          )}
        />
        {runError && <ErrorNote error={runError} />}
      </section>

      <section id="ledger" className="market-section space-y-6">
        <GuideTip topic="market" />
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="eyebrow text-accent">The market ledger</p><h2 className="section-title mt-3">See the bigger picture.</h2></div>
          <button type="button" className={btn.small} onClick={reset} disabled={busy !== null}>
            {busy === "reset" ? "Resetting..." : "Reset demo"}
          </button>
        </div>
        {resetError && <ErrorNote error={resetError} />}

      {debts.error ? (
        <ErrorNote error={debts.error} onRetry={debts.reload} />
      ) : debts.loading ? (
        <Loading />
      ) : (
        <>
          <Card title="Every connection counts." actions={<Badge tone="blue">{confirmed.length} confirmed debts</Badge>}>
            <p className="mb-5 text-sm leading-6 text-zinc-500">Follow the arrows from the person who owes to the person owed. Debts that form a circle can cancel without money moving.</p>
            {traders.length === 0 ? (
              <Loading />
            ) : (
              <Network traders={traders} edges={confirmed.map((d) => ({ ...d, amountCents: d.remainingCents }))} label="Debt network" />
            )}
            {confirmed.length === 0 && <p className="mt-3 text-sm text-zinc-600">No confirmed debt. Add a debt or reset the demo.</p>}
          </Card>

          <Card title="Ledger" actions={<Badge>{debts.data!.length} debts</Badge>}>
            {debts.data!.length === 0 ? (
              <Empty title="No debts yet">
                <Link href="/add" className="font-medium text-accent underline">
                  Add a debt
                </Link>
              </Empty>
            ) : (
              <div className="w-full">
                <AgGridReact<Debt> theme={financeGridTheme} rowData={debts.data} columnDefs={columns} domLayout="autoHeight" getRowId={(p) => p.data.id} />
              </div>
            )}
          </Card>
        </>
      )}
      </section>
    </div>
  );
}
