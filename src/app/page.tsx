"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClearingStats, Round } from "@/lib/types";
import { api, useApi } from "@/components/api";
import { useApp } from "@/components/app";
import { CountUp } from "@/components/count-up";
import { Ledger } from "@/components/ledger";
import { Network } from "@/components/network";
import { btn, Card, ErrorNote, Loading } from "@/components/ui";
import { Rhythm } from "@/components/workflow";

export default function MarketPage() {
  const router = useRouter();
  const { traders, debts } = useApp();
  const latest = useApi<Round>("/api/rounds/latest");
  const [busy, setBusy] = useState<"run" | "reset" | null>(null);
  const [runError, setRunError] = useState<Error | null>(null);
  const [resetError, setResetError] = useState<Error | null>(null);

  const confirmed = (debts.data ?? []).filter((d) => d.status === "confirmed");
  const total = confirmed.reduce((sum, d) => sum + d.remainingCents, 0);
  // The route ignores the query. It changes the path, so the preview loads again when the confirmed debts change.
  const preview = useApi<{ stats: ClearingStats | null }>(debts.data ? `/api/rounds/preview?v=${confirmed.length}-${total}` : null);
  const stats = preview.data?.stats;
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

  return (
    <div>
      <section className="bleed brand-band market-hero" aria-labelledby="market-title">
        <div className="band-content">
          <div className="min-w-0">
            <h1 id="market-title" className="display-title">Less to pay.<br />More to grow.</h1>
            <p className="mt-4 max-w-md text-base leading-7 sm:text-lg">Debts that form a circle cancel. You pay only what remains.</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 max-sm:mt-5">
              {latest.loading ? null : openRound ? (
                <Link href={`/rounds/${openRound.id}`} className={btn.inverse}>
                  Continue round
                </Link>
              ) : (
                <>
                  <button type="button" className={btn.inverse} onClick={runClearing} disabled={busy !== null || debts.loading || stats === null}>
                    {busy === "run" ? "Running clearing..." : "Run clearing"}
                  </button>
                  {stats ? (
                    <p className="text-base font-medium tabular-nums">
                      <CountUp cents={stats.clearedByCirclesCents} /> cancel, <CountUp cents={stats.cashMovedCents} /> to pay
                    </p>
                  ) : stats === null ? (
                    <p className="text-sm">No confirmed debt to clear yet.</p>
                  ) : null}
                </>
              )}
            </div>
            {runError && <div className="mt-4"><ErrorNote error={runError} /></div>}
          </div>
          <div className="hero-network">
            {traders.length === 0 ? (
              <Loading />
            ) : (
              <Network traders={traders} edges={confirmed.map((d) => ({ ...d, amountCents: d.remainingCents }))} label="Debt network" />
            )}
          </div>
        </div>
      </section>

      <div className="market-section">
        <Card title="Today">
          <Rhythm debts={debts.data} stats={stats} statsError={preview.error} onRetry={preview.reload} />
        </Card>
      </div>

      <div id="ledger" className="market-section">
        <Card
          title="Ledger"
          actions={
            <button type="button" className={btn.small} onClick={reset} disabled={busy !== null}>
              {busy === "reset" ? "Resetting..." : "Reset demo"}
            </button>
          }
        >
          {resetError && <div className="mb-4"><ErrorNote error={resetError} /></div>}
          {debts.error ? <ErrorNote error={debts.error} onRetry={debts.reload} /> : debts.loading ? <Loading /> : <Ledger debts={debts.data!} />}
        </Card>
      </div>
    </div>
  );
}
