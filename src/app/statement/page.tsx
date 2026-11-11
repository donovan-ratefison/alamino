"use client";

import Link from "next/link";
import type { Statement } from "@/lib/types";
import { formatUsd, useApi } from "@/components/api";
import { useApp } from "@/components/app";
import { Card, Empty, ErrorNote, Loading, PageHeader } from "@/components/ui";

function netText(s: Statement): string {
  if (s.action === "pay_in") return `You pay in ${formatUsd(Math.abs(s.netCents))}`;
  if (s.action === "receive") return `You receive ${formatUsd(Math.abs(s.netCents))}`;
  return "Nothing to pay";
}

export default function StatementPage() {
  const { traderId, name } = useApp();
  const statement = useApi<Statement>(`/api/rounds/latest/statement/${traderId}`);
  const s = statement.data;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title={`Statement for ${name(traderId)}`}>What the latest clearing round did to your debts, and why.</PageHeader>
      {statement.error?.status === 404 ? (
        <Empty title="No clearing round yet">
          <Link href="/" className="font-medium text-accent underline">
            Go to the market
          </Link>{" "}
          and run clearing.
        </Empty>
      ) : statement.error ? (
        <ErrorNote error={statement.error} onRetry={statement.reload} />
      ) : !s ? (
        <Loading />
      ) : (
        <>
          <Card>
            <p className="text-lg font-semibold text-zinc-900">{netText(s)}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-700">{s.summary}</p>
            <Link href={`/rounds/${s.roundId}`} className="mt-3 inline-block text-sm font-medium text-accent underline">
              View the round
            </Link>
          </Card>
          <Card title="Your debts in this round">
            {s.lines.length === 0 ? (
              <p className="text-sm text-zinc-600">You had no debt in this round.</p>
            ) : (
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-zinc-200 text-zinc-600">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Counterparty</th>
                      <th className="py-2 pr-4 font-medium">Direction</th>
                      <th className="py-2 pr-4 text-right font-medium">Before</th>
                      <th className="py-2 pr-4 text-right font-medium">After</th>
                      <th className="py-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {s.lines.map((l) => (
                      <tr key={l.debtId} className="align-top">
                        <td className="py-2 pr-4 font-medium text-zinc-900">{name(l.counterparty)}</td>
                        <td className="py-2 pr-4 text-zinc-700">{l.direction === "you_owe" ? "You owe" : "Owed to you"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{formatUsd(l.beforeCents)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{formatUsd(l.afterCents)}</td>
                        <td className="py-2 text-zinc-700">{l.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
