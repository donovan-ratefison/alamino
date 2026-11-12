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
import { GuideTip } from "@/components/guide-tip";

// What clearing would do now. For a trader, `stats` are their own numbers, plus what they pay or receive.
interface Preview {
  stats: ClearingStats | null;
  action?: "pay_in" | "receive" | "nothing";
  amountCents?: number;
}

// "After clearing, you pay $170." for a trader, from the preview.
function TraderOutcome({ preview }: { preview?: Preview }) {
  if (!preview) return null;
  if (preview.stats === null) return <>You have no confirmed debt to clear yet.</>;
  const cents = preview.amountCents ?? 0;
  if (preview.action === "pay_in") return <>After clearing, you pay <CountUp cents={cents} />.</>;
  if (preview.action === "receive") return <>After clearing, you receive <CountUp cents={cents} />.</>;
  return <>After clearing, you have nothing to pay.</>;
}

export default function MarketPage() {
  const router = useRouter();
  const { traders, debts, traderId, isHouse, name } = useApp();
  const latest = useApi<Round>("/api/rounds/latest");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<Error | null>(null);

  const confirmed = (debts.data ?? []).filter((d) => d.status === "confirmed");
  const total = confirmed.reduce((sum, d) => sum + d.remainingCents, 0);
  // The route ignores the query. It changes the path, so the preview loads again when the viewer or the confirmed debts change.
  const preview = useApi<Preview>(debts.data ? `/api/rounds/preview?viewer=${traderId}&v=${confirmed.length}-${total}` : null);
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
            {isHouse ? (
              <>
                <h1 id="market-title" className="display-title">Settle up with the whole market.</h1>
                <p className="mt-3 max-w-md text-[15px] leading-6 sm:mt-4 sm:text-lg sm:leading-7">When debts go around in a circle, they cancel. You pay only what is left.</p>
              </>
            ) : (
              <>
                <h1 id="market-title" className="display-title">Hello {name(traderId)}.</h1>
                <p className="mt-3 max-w-md text-2xl leading-tight font-medium tabular-nums sm:mt-4 sm:text-4xl">
                  <TraderOutcome preview={preview.data} />
                </p>
              </>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 max-sm:mt-4">
              {latest.loading ? null : openRound ? (
                <Link href={`/rounds/${openRound.id}`} className={btn.inverse}>
                  Continue round
                </Link>
              ) : !isHouse ? (
                <p className="text-sm">The clearing house runs the next round.</p>
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
              <Network
                traders={traders}
                edges={confirmed.map((d) => ({ ...d, amountCents: d.remainingCents }))}
                label={isHouse ? "Debt network" : "Your debt network"}
                center={isHouse ? undefined : traderId}
              />
            )}
          </div>
        </div>
      </section>

      <div className="market-section">
        <Rhythm debts={debts.data} />
      </div>

      <div id="ledger" className="market-section space-y-6">
        <Card title="Ledger">
          {debts.error ? <ErrorNote error={debts.error} onRetry={debts.reload} /> : debts.loading ? <Loading /> : <Ledger debts={debts.data!} />}
        </Card>
        <GuideTip topic="market" />
      </div>
    </div>
  );
}
