import Link from "next/link";

const steps = [
  { label: "Capture", detail: "A sentence or a photo.", href: "/add" },
  { label: "Confirm", detail: "Both sides agree.", href: "/confirm" },
  { label: "Clear", detail: "Let the circles cancel.", href: "/" },
  { label: "Settle", detail: "Pay only what remains.", href: "/rounds/latest" },
];

export function Workflow({ current }: { current?: number }) {
  return <ol className="workflow" aria-label="How Alamino works">{steps.map((step, i) => <li key={step.label}>
    <Link href={step.href} aria-current={current === i ? "step" : undefined}>
      <span className="step-number">0{i + 1}</span>
      <span><span className="block text-sm font-medium text-brand">{step.label}</span><span className="mt-1 block text-xs leading-5 text-zinc-500">{step.detail}</span></span>
    </Link>
  </li>)}</ol>;
}
