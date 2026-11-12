"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useApp } from "./app";
import { startGuide } from "./demo-guide";
import { Badge, ErrorNote } from "./ui";
import { TourTrigger } from "./guided-tour";

// The PayPal and AI modes, shown in the "More" menu.
export function ModeBadges() {
  const { config } = useApp();
  if (!config) return null;
  return (
    <>
      <Badge tone="blue">{config.paypalMode === "simulated" ? "PayPal simulated" : "PayPal Sandbox"}</Badge>
      {config.aiMode === "fallback" && <Badge>AI fallback</Badge>}
    </>
  );
}

// The guides, the demo reset, the modes, and on a phone the links that do not fit the bottom bar.
export function MoreMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<Error | null>(null);

  // Reseed the database, then reload on the market so every list shows the seed data.
  async function reset() {
    setResetting(true);
    setResetError(null);
    try {
      await api("/api/demo/reset", {});
      // A full reload, not router.push: every cached list (debts, rounds, traders) must load again.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      location.assign("/");
    } catch (e) {
      setResetError(e as Error);
      setResetting(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={root} className="more-menu">
      <button
        ref={button}
        type="button"
        className="bell-button"
        aria-label="More"
        data-tour="help"
        aria-expanded={open}
        aria-controls={open ? "more-panel" : undefined}
        onClick={() => setOpen(!open)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div id="more-panel" className="bell-panel more-panel">
          <div className="grid">
            <TourTrigger menu onStart={() => { setOpen(false); button.current?.focus(); }} />
            <button
              type="button"
              className="nav-link w-full"
              onClick={() => {
                startGuide();
                setOpen(false);
              }}
            >
              Demo guide
            </button>
            <Link
              href="/finance"
              // The panel renders only in the browser, after a click. usePathname here would need a Suspense boundary.
              aria-current={location.pathname.startsWith("/finance") ? "page" : undefined}
              className="nav-link w-full sm:hidden"
              onClick={() => setOpen(false)}
            >
              AI Finance
            </Link>
            <button type="button" className="nav-link w-full disabled:opacity-60" disabled={resetting} onClick={reset}>
              {resetting ? "Resetting..." : "Reset demo"}
            </button>
            {resetError && <ErrorNote error={resetError} />}
          </div>
          <div className="grid gap-2 border-t border-zinc-200 px-2 pt-3">
            <p className="text-xs text-zinc-500">Modes</p>
            <div className="flex flex-wrap gap-2"><ModeBadges /></div>
          </div>
        </div>
      )}
    </div>
  );
}
