"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { useApp } from "./app";

const slots = [
  { href: "/", label: "Market", match: (p: string) => p === "/" },
  { href: "/confirm", label: "Confirm", match: (p: string) => p.startsWith("/confirm") },
  { href: "/add", label: "Add a debt", match: (p: string) => p.startsWith("/add") },
  { href: "/rounds/latest", label: "Round", match: (p: string) => p.startsWith("/rounds") },
  { href: "/statement", label: "Statement", match: (p: string) => p.startsWith("/statement") },
];

function Slots({ pathname }: { pathname: string }) {
  const { pendingCount } = useApp();
  return (
    <nav aria-label="Phone" className="bottom-bar">
      {slots.map(({ href, label, match }) =>
        href === "/add" ? (
          <Link key={href} href={href} aria-label={label} aria-current={match(pathname) ? "page" : undefined} className="bottom-slot">
            <span className="bottom-camera">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
          </Link>
        ) : (
          <Link key={href} href={href} aria-current={match(pathname) ? "page" : undefined} className="bottom-slot">
            <span>{label}</span>
            {href === "/confirm" && pendingCount > 0 && (
              <span className="bottom-count">
                {pendingCount}
                <span className="sr-only"> waiting for you</span>
              </span>
            )}
          </Link>
        ),
      )}
    </nav>
  );
}

function CurrentSlots() {
  return <Slots pathname={usePathname()} />;
}

// Phone navigation, below 640 px. Hidden with display: none on wider screens.
export function BottomBar() {
  return (
    <Suspense fallback={<Slots pathname="" />}>
      <CurrentSlots />
    </Suspense>
  );
}
