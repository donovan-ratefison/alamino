"use client";

import Link from "next/link";
import type { Debt } from "@/lib/types";
import { formatUsd } from "./api";
import { useApp } from "./app";
import { TraderChip } from "./trader-chip";
import { Badge, Empty } from "./ui";

type Tone = Parameters<typeof Badge>[0]["tone"];

// One plain status for a debt. For a proposed debt, it says who still has to approve.
function status(d: Debt, name: (id: string) => string): [string, Tone] {
  switch (d.status) {
    case "proposed":
      if (!d.debtorOk && !d.creditorOk) return ["Waiting for both", "amber"];
      return [`Waiting for ${name(d.debtorOk ? d.creditorId : d.debtorId)}`, "amber"];
    case "disputed":
      return ["Disputed", "red"];
    case "confirmed":
      return ["Ready to clear", "blue"];
    case "cleared":
      return ["Cancelled", "green"];
    case "settled":
      return ["Settled", "green"];
    case "deferred":
      return ["Deferred", "neutral"];
  }
}

// Under 640 px the CSS shows each row as a 2 x 2 grid: debt and amount, note and status.
// The server filters the list: a trader gets only their own debts, the clearing house gets all.
export function Ledger({ debts }: { debts: Debt[] }) {
  const { name } = useApp();

  if (debts.length === 0) {
    return (
      <Empty title="No debts yet">
        <Link href="/add" className="font-medium text-accent underline">
          Add a debt
        </Link>
      </Empty>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="ledger-table">
        <thead>
          <tr>
            <th scope="col" className="text-left">Debt</th>
            <th scope="col" className="text-right">Amount</th>
            <th scope="col" className="text-left">Note</th>
            <th scope="col" className="text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {debts.map((d) => {
            const [text, tone] = status(d, name);
            return (
              <tr key={d.id} data-status={d.status}>
                <td>
                  <span className="flex items-center gap-2.5">
                    <TraderChip id={d.debtorId} name={name(d.debtorId)} />
                    <span>
                      {name(d.debtorId)} owes {name(d.creditorId)}
                    </span>
                  </span>
                </td>
                <td className="text-right tabular-nums">
                  <span className="font-semibold">{formatUsd(d.amountCents)}</span>
                  {d.remainingCents !== d.amountCents && <span className="block text-xs text-zinc-500">left: {formatUsd(d.remainingCents)}</span>}
                </td>
                <td className="text-zinc-600" title={d.note}>{d.note}</td>
                <td>
                  <Badge tone={tone}>{text}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
