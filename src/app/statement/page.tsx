"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Round, Statement } from "@/lib/types";
import { api, formatUsd, useApi } from "@/components/api";
import { useApp } from "@/components/app";
import { CountUp } from "@/components/count-up";
import { Receipt } from "@/components/receipt";
import { TraderChip } from "@/components/trader-chip";
import { Card, Empty, ErrorNote, Loading, PageHeader } from "@/components/ui";
import { GuideTip } from "@/components/guide-tip";

// The action words of the big heading. The amount follows them.
const actionText = { pay_in: "You pay in", receive: "You receive", nothing: "Nothing to pay" };
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default function StatementPage() {
  const { traderId, traders, name, config } = useApp();
  // The plain-code statement comes at once. The model text follows in the background.
  const statement = useApi<Statement>(`/api/rounds/latest/statement/${traderId}?text=plain`);
  const plain = statement.data;
  const withModel = !!plain && config?.aiMode === "model";
  const [ai, setAi] = useState<{ for: Statement; s: Statement | null } | null>(null);

  useEffect(() => {
    if (!plain || !withModel) return;
    let live = true;
    // On an error, keep the plain text.
    api<Statement>(`/api/rounds/${plain.roundId}/statement/${plain.traderId}`).then(
      (s) => live && setAi({ for: plain, s }),
      () => live && setAi({ for: plain, s: null }),
    );
    return () => {
      live = false;
    };
  }, [plain, withModel]);

  const answered = !!plain && ai?.for === plain;
  const s = (answered && ai.s) || plain;
  // Only for the receipt date. The statement has no date of its own.
  const round = useApi<Round>(plain ? `/api/rounds/${plain.roundId}` : null).data;
  const idOf = (counterparty: string) => traders.find((t) => t.name === counterparty)?.id ?? counterparty;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {statement.error?.status === 404 ? (
        <>
          <PageHeader title={`Statement for ${name(traderId)}`} />
          <GuideTip topic="statement" />
          <Empty title="No clearing round yet">
            <Link href="/" className="font-medium text-accent underline">
              Go to the market
            </Link>{" "}
            and run clearing.
          </Empty>
        </>
      ) : statement.error ? (
        <>
          <PageHeader title={`Statement for ${name(traderId)}`} />
          <GuideTip topic="statement" />
          <ErrorNote error={statement.error} onRetry={statement.reload} />
        </>
      ) : !s ? (
        <>
          <PageHeader title={`Statement for ${name(traderId)}`} />
          <GuideTip topic="statement" />
          <Loading />
        </>
      ) : (
        <>
          <div className="page-heading space-y-3">
            <p className="text-sm font-medium text-zinc-600">Statement for {name(traderId)}</p>
            <h1>
              {actionText[s.action]}
              {s.action !== "nothing" && (
                <>
                  {" "}
                  <CountUp cents={Math.abs(s.netCents)} className="tabular-nums" />
                </>
              )}
            </h1>
            <div className="page-heading-copy space-y-2">
              <p>{s.summary}</p>
              {withModel && !answered && (
                <p role="status" className="text-xs text-zinc-500">
                  Writing the explanation...
                </p>
              )}
              <Link href={`/rounds/${s.roundId}`} className="inline-block text-sm font-medium text-accent underline">
                View the round
              </Link>
            </div>
          </div>

          <GuideTip topic="statement" />
          <Card title="Your debts in this round">
            {s.lines.length === 0 ? (
              <p className="text-sm text-zinc-600">You had no debt in this round.</p>
            ) : (
              <ul className="space-y-3">
                {s.lines.map((l) => {
                  const cancelled = l.beforeCents - l.afterCents;
                  const share = l.beforeCents > 0 ? (cancelled / l.beforeCents) * 100 : 0;
                  return (
                    <li key={l.debtId} className="space-y-3 rounded-2xl border border-zinc-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <div className="flex items-center gap-3">
                          <TraderChip id={idOf(l.counterparty)} name={l.counterparty} />
                          <div>
                            <p className="text-sm font-medium text-zinc-900">{l.counterparty}</p>
                            <p className="text-xs text-zinc-600">{l.direction === "you_owe" ? "You owe" : "Owes you"}</p>
                          </div>
                        </div>
                        <p className="text-base font-medium tabular-nums text-brand">
                          {formatUsd(l.beforeCents)}
                          <span aria-hidden="true"> → </span>
                          <span className="sr-only"> to </span>
                          {formatUsd(l.afterCents)}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <div aria-hidden="true" className="flex h-1.5 overflow-hidden rounded-full bg-zinc-200">
                          <div className="bg-accent" style={{ width: `${share}%` }} />
                        </div>
                        <p className="text-xs font-medium text-zinc-700">
                          {cancelled > 0 ? `${formatUsd(cancelled)} cancelled` : "Nothing cancelled"}
                        </p>
                      </div>
                      <p title={l.reason} className="line-clamp-2 text-sm text-zinc-600">
                        {l.reason}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Receipt s={s} trader={name(traderId)} date={round && dateFormat.format(new Date(round.createdAt))} />
        </>
      )}
    </div>
  );
}
