import type { ReactNode } from "react";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50";

export const btn = {
  primary: `${base} h-9 px-4 bg-accent text-white hover:bg-accent/90`,
  secondary: `${base} h-9 px-4 border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100`,
  small: `${base} h-8 px-3 border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100`,
};

export const field =
  "h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400";

export const label = "text-sm font-medium text-zinc-700";

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-zinc-200 bg-white ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const tones = {
  neutral: "border-zinc-200 bg-zinc-100 text-zinc-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-800",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="text-2xl font-semibold tabular-nums text-zinc-900">{value}</div>
      <div className="mt-1 text-sm text-zinc-600">{label}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
      {children && <div className="mt-1 text-sm text-zinc-600">{children}</div>}
    </div>
  );
}

export function Loading({ text = "Loading..." }: { text?: string }) {
  return (
    <p role="status" className="py-8 text-center text-sm text-zinc-500">
      {text}
    </p>
  );
}

export function ErrorNote({ error, onRetry }: { error: { message: string }; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <span>Error: {error.message}</span>
      {onRetry && (
        <button type="button" className={btn.small} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-10 text-center">
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      {children && <div className="mt-2 text-sm text-zinc-600">{children}</div>}
    </div>
  );
}
