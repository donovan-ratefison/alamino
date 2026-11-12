"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { TraderId } from "@/lib/types";
import { useApp } from "./app";
import { NavIcon } from "./nav-icon";
import { btn } from "./ui";

const STEPS: { text: string; href: string; trader?: TraderId }[] = [
  { text: 'Add a debt as Rivo. Type "I owe Hery 50 for rice".', href: "/add", trader: "rivo" },
  { text: "Approve it as Hery.", href: "/confirm", trader: "hery" },
  { text: "Run clearing on the market.", href: "/" },
  { text: "Pay in as Soa, Lalao and Fidy. Send payouts.", href: "/rounds/latest", trader: "soa" },
  { text: "Read the statement.", href: "/statement" },
];

// Guide state: "hidden", a step number "1" to "5", or null for a visitor who has not chosen yet.
// Kept in localStorage. Private browsing can block storage: the state then lives until the next reload.
const KEY = "alamino.guide";
const listeners = new Set<() => void>();
let state: string | null | undefined;

function read(): string {
  if (state === undefined) {
    try {
      state = localStorage.getItem(KEY);
    } catch {
      state = null;
    }
  }
  return state ?? "new";
}

function write(value: string) {
  state = value;
  try {
    localStorage.setItem(KEY, value);
  } catch {}
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// For the "Demo guide" entry of the "..." menu.
export const startGuide = () => write("1");

// A slim bar under the header for a visitor who does not know where to click.
export function DemoGuide() {
  const { setTraderId } = useApp();
  // Hidden on the server: the stored choice is known only in the browser.
  const value = useSyncExternalStore(subscribe, read, () => "hidden");
  if (value === "hidden") return null;

  const n = Number(value);
  const step = n >= 1 && n <= STEPS.length ? STEPS[n - 1] : null;

  return (
    <aside aria-label="Demo guide" className="demo-guide">
      <div className="band-content demo-guide-row">
        {step ? (
          <>
            <p aria-live="polite" className="demo-guide-text">
              <span className="font-semibold">
                Step {n} of {STEPS.length}:
              </span>{" "}
              {step.text}
            </p>
            <Link href={step.href} aria-label={`Go to step ${n}`} className="shrink-0 px-1 py-1.5 font-medium text-accent underline" onClick={() => step.trader && setTraderId(step.trader)}>
              Go
            </Link>
            <div className="flex gap-1">
              <button type="button" className="demo-guide-icon" aria-label="Back" title="Back" disabled={n === 1} onClick={() => write(String(n - 1))}>
                <NavIcon name="back" width="16" height="16" />
              </button>
              <button type="button" className="demo-guide-icon" aria-label="Next" title="Next" disabled={n === STEPS.length} onClick={() => write(String(n + 1))}>
                <NavIcon name="next" width="16" height="16" />
              </button>
              <button type="button" className="demo-guide-icon" aria-label="Close" title="Close" onClick={() => write("hidden")}>
                <NavIcon name="close" width="16" height="16" />
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="demo-guide-text">New here? Start the demo guide.</p>
            <div className="flex gap-1">
              <button type="button" className={`${btn.small} ui-button-compact`} onClick={startGuide}>
                Start
              </button>
              <button type="button" className={`${btn.secondary} ui-button-compact`} onClick={() => write("hidden")}>
                Hide
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
