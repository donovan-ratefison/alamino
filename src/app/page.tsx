"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, type ColDef } from "ag-grid-community";
import type { Debt, Round } from "@/lib/types";
import { api, formatUsd, useApi } from "@/components/api";
import { useApp } from "@/components/app";
import { Network } from "@/components/network";
import { Badge, btn, Card, Empty, ErrorNote, Loading, Stat } from "@/components/ui";

ModuleRegistry.registerModules([AllCommunityModule]);

const money = { valueFormatter: (p: { value: number }) => formatUsd(p.value), type: "rightAligned", minWidth: 110, flex: 1 };

export default function MarketPage() {
  const router = useRouter();
  const { traders, name, refreshPending } = useApp();
  const debts = useApi<Debt[]>("/api/debts");
  const latest = useApi<Round>("/api/rounds/latest");
  const [busy, setBusy] = useState<"run" | "reset" | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);

  const confirmed = (debts.data ?? []).filter((d) => d.status === "confirmed");
  const total = confirmed.reduce((sum, d) => sum + d.remainingCents, 0);
  const openRound = latest.data && latest.data.status !== "done" ? latest.data : null;

  async function runClearing() {
    setBusy("run");
    setActionError(null);
    try {
      const round = await api<Round>("/api/rounds", {});
      router.push(`/rounds/${round.id}`);
    } catch (e) {
      setActionError(e as Error);
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    setActionError(null);
    try {
      await api("/api/demo/reset", {});
      debts.reload();
      latest.reload();
      refreshPending();
    } catch (e) {
      setActionError(e as Error);
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
    <div className="space-y-6">
      <section className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Market debts</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Malagasy banks net their debts through BFM. Market traders can&apos;t. Alamino brings clearing to the market: debts that form
            circles cancel with no money, and only the small remainder moves through PayPal.
          </p>
        </div>
        <ol className="grid gap-2 text-sm text-zinc-700 sm:grid-cols-3">
          <li className="rounded-md border border-zinc-200 bg-white px-3 py-2">1. Traders record what they owe each other.</li>
          <li className="rounded-md border border-zinc-200 bg-white px-3 py-2">2. Debts that form a circle cancel. No money moves.</li>
          <li className="rounded-md border border-zinc-200 bg-white px-3 py-2">3. Only the remainder is paid through PayPal.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          {latest.loading ? null : openRound ? (
            <Link href={`/rounds/${openRound.id}`} className={btn.primary}>
              Continue round
            </Link>
          ) : (
            <button type="button" className={btn.primary} onClick={runClearing} disabled={busy !== null || debts.loading}>
              {busy === "run" ? "Running clearing..." : "Run clearing"}
            </button>
          )}
          <button type="button" className={btn.secondary} onClick={reset} disabled={busy !== null}>
            {busy === "reset" ? "Resetting..." : "Reset demo"}
          </button>
        </div>
        {actionError && <ErrorNote error={actionError} />}
      </section>

      {debts.error ? (
        <ErrorNote error={debts.error} onRetry={debts.reload} />
      ) : debts.loading ? (
        <Loading />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Total confirmed debt" value={formatUsd(total)} />
            <Stat label="Confirmed debts" value={confirmed.length} hint={`${debts.data!.length} debts in the ledger`} />
            <Stat label="Traders" value={traders.length} />
          </div>

          <Card title="Debt network" actions={<span className="text-xs text-zinc-500">Arrow: from debtor to creditor. Confirmed debts only.</span>}>
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
                <AgGridReact<Debt> rowData={debts.data} columnDefs={columns} domLayout="autoHeight" getRowId={(p) => p.data.id} />
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
