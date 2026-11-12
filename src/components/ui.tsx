import type { ReactNode } from "react";

export const btn = {
  primary: "ui-button ui-button-primary",
  secondary: "ui-button ui-button-secondary",
  small: "ui-button ui-button-small",
  inverse: "ui-button ui-button-inverse",
  outlineOnBlue: "ui-button ui-button-outline",
};

export const field = "ui-field";

export const label = "text-sm font-medium text-zinc-700";

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`ui-card ${className}`}>
      {(title || actions) && (
        <div className="ui-card-heading">
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      <div className="ui-card-content">{children}</div>
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
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-4 ${tones[tone]}`}>{children}</span>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="ui-stat">
      <div className="ui-stat-value">{value}</div>
      <div className="mt-4 text-sm font-medium text-zinc-800">{label}</div>
      {hint && <div className="mt-2 text-xs leading-5 text-zinc-500">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-heading">
      <h1>{title}</h1>
      {children && <div className="page-heading-copy">{children}</div>}
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
    <div className="ui-empty">
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      {children && <div className="mt-2 text-sm text-zinc-600">{children}</div>}
    </div>
  );
}
