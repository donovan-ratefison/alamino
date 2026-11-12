"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { showLink, useApp } from "./app";
import { NavIcon, type NavIconName } from "./nav-icon";

const slots = [
  { href: "/", label: "Market", icon: "market", match: (p: string) => p === "/" },
  { href: "/confirm", label: "Confirm", icon: "confirm", match: (p: string) => p.startsWith("/confirm") },
  { href: "/add", label: "Add a debt", icon: "add", match: (p: string) => p.startsWith("/add") },
  { href: "/rounds/latest", label: "Payments", icon: "payments", match: (p: string) => p.startsWith("/rounds") },
  { href: "/statement", label: "Statement", icon: "statement", match: (p: string) => p.startsWith("/statement") },
  { href: "/finance", label: "AI Finance", icon: "finance", match: (p: string) => p.startsWith("/finance") },
] satisfies { href: string; label: string; icon: NavIconName; match: (p: string) => boolean }[];

function Slots({ pathname }: { pathname: string }) {
  const { pendingCount, isHouse } = useApp();
  return (
    <nav aria-label="Phone" className="bottom-bar">
      {slots.filter((s) => showLink(s.href, isHouse)).map(({ href, label, icon, match }) => (
          <Link key={href} href={href} data-tour={icon} aria-current={match(pathname) ? "page" : undefined} className="bottom-slot">
            <span className={icon === "add" ? "bottom-camera" : "bottom-icon"}><NavIcon name={icon} width="23" height="23" /></span>
            <span className="bottom-label">{label}</span>
            {href === "/confirm" && pendingCount > 0 && (
              <span className="bottom-count">
                {pendingCount}
                <span className="sr-only"> waiting for you</span>
              </span>
            )}
          </Link>
        ))}
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
