import type { Statement } from "@/lib/types";
import { formatUsd } from "./api";

// A plain receipt of one trader's round. All numbers come from the statement lines.
export function Receipt({ s, trader, date }: { s: Statement; trader: string; date?: string }) {
  const total = (pick: (l: Statement["lines"][number]) => number) => s.lines.reduce((n, l) => n + pick(l), 0);
  const rows: [string, number][] = [
    ["You owed", total((l) => (l.direction === "you_owe" ? l.beforeCents : 0))],
    ["You were owed", total((l) => (l.direction === "owed_to_you" ? l.beforeCents : 0))],
    ["Cancelled with no money", total((l) => l.beforeCents - l.afterCents)],
  ];
  const net = formatUsd(Math.abs(s.netCents));
  const result: [string, string] =
    s.action === "pay_in" ? ["You pay", net] : s.action === "receive" ? ["You receive", net] : ["Nothing to pay", ""];

  return (
    <section aria-labelledby="receipt-title" className="mx-auto w-full rounded-xl border border-zinc-200 bg-white p-5 tabular-nums sm:max-w-[360px]">
      <h2 id="receipt-title" className="eyebrow text-center text-zinc-500">
        Receipt
      </h2>
      <div className="mt-3 text-center">
        <p className="text-lg font-semibold tracking-tight text-brand">Alamino</p>
        <p className="text-sm text-zinc-700">{trader}</p>
        {date && <p className="text-xs text-zinc-500">{date}</p>}
      </div>
      <dl className="mt-5 space-y-2 border-t border-dashed border-zinc-300 pt-4 text-sm">
        {rows.map(([label, cents]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-zinc-600">{label}</dt>
            <dd className="text-zinc-900">{formatUsd(cents)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex justify-between gap-4 border-t border-zinc-300 pt-3 font-semibold text-zinc-900">
        <span>{result[0]}</span>
        <span>{result[1]}</span>
      </p>
      <p className="mt-5 text-center text-xs text-zinc-500">Cleared by Alamino</p>
    </section>
  );
}
