"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClearingStats, Round } from "@/lib/types";
import { api, useApi } from "@/components/api";
import { useApp } from "@/components/app";
import { CountUp } from "@/components/count-up";
import { Ledger, LedgerFilter } from "@/components/ledger";
import { Network } from "@/components/network";
import { btn, Card, ErrorNote, Loading } from "@/components/ui";
import { Rhythm } from "@/components/workflow";
import { GuideTip } from "@/components/guide-tip";

export default function MarketPage() {
  const router = useRouter();
  const { traders, debts } = useApp();
  const latest = useApi<Round>("/api/rounds/latest");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<Error | null>(null);
  const [mine, setMine] = useState(false);

  const confirmed = (debts.data ?? []).filter((d) => d.status === "confirmed");
  const total = confirmed.reduce((sum, d) => sum + d.remainingCents, 0);
  // The route ignores the query. It changes the path, so the preview loads again when the confirmed debts change.
  const preview = useApi<{ stats: ClearingStats | null }>(debts.data ? `/api/rounds/preview?v=${confirmed.length}-${total}` : null);
  const stats = preview.data?.stats;
  const openRound = latest.data && latest.data.status !== "done" ? latest.data : null;

  async function runClearing() {
    setRunning(true);
    setRunError(null);
    try {
      const round = await api<Round>("/api/rounds", {});
      router.push(`/rounds/${round.id}`);
    } catch (e) {
      setRunError(e as Error);
      setRunning(false);
    }
  }

  return (
    <div>
      <section className="bleed brand-band market-hero" aria-labelledby="market-title">
        <div className="band-content">
          <div className="min-w-0">
            <h1 id="market-title" className="display-title">Less to pay.<br />More to grow.</h1>
            <p className="mt-3 max-w-md text-[15px] leading-6 sm:mt-4 sm:text-lg sm:leading-7">Debts that form a circle cancel. You pay only what remains.</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 max-sm:mt-4">
              {latest.loading ? null : openRound ? (
                <Link href={`/rounds/${openRound.id}`} className={btn.inverse}>
                  Continue round
                </Link>
              ) : (
                <>
                  <button type="button" className={btn.inverse} onClick={runClearing} disabled={running || debts.loading || stats === null}>
                    {running ? "Running clearing..." : "Run clearing"}
                  </button>
                  {stats ? (
                    <p className="text-base font-medium tabular-nums">
                      <CountUp cents={stats.grossCents} /> of debt settles with <CountUp cents={stats.cashMovedCents} />
                    </p>
                  ) : stats === null ? (
                    <p className="text-sm">No confirmed debt to clear yet.</p>
                  ) : null}
                </>
              )}
            </div>
            {runError && <div className="mt-4"><ErrorNote error={runError} /></div>}
            {preview.error && <div className="mt-4"><ErrorNote error={preview.error} onRetry={preview.reload} /></div>}
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
        <Rhythm debts={debts.data} />
      </div>

      <div id="ledger" className="market-section space-y-6">
        <Card title="Ledger" actions={debts.data?.length ? <LedgerFilter mine={mine} onChange={setMine} /> : null}>
          {debts.error ? <ErrorNote error={debts.error} onRetry={debts.reload} /> : debts.loading ? <Loading /> : <Ledger debts={debts.data!} mine={mine} />}
        </Card>
        <GuideTip topic="market" />
      </div>
    </div>
  );
}
