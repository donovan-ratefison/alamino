"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "./app";
import { Badge } from "./ui";
import { TourTrigger } from "./guided-tour";

// The PayPal and AI modes. In the header on a desktop, in the "More" menu on a phone.
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

// Phone only (hidden with CSS above 640 px): the links and modes that do not fit the header.
export function MoreMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

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
          <nav aria-label="More">
            <TourTrigger menu onStart={() => setOpen(false)} />
            <Link
              href="/finance"
              // The panel renders only in the browser, after a click. usePathname here would need a Suspense boundary.
              aria-current={location.pathname.startsWith("/finance") ? "page" : undefined}
              className="nav-link w-full"
              onClick={() => setOpen(false)}
            >
              AI Finance
            </Link>
          </nav>
          <div className="grid gap-2 border-t border-zinc-200 px-2 pt-3">
            <p className="text-xs text-zinc-500">Modes</p>
            <div className="flex flex-wrap gap-2"><ModeBadges /></div>
          </div>
        </div>
      )}
    </div>
  );
}
