"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, Suspense, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { Debt, Trader, TraderId } from "@/lib/types";
import { useApi, waitingFor } from "./api";
import { Brand } from "./brand";
import { Bell } from "./bell";
import { ModeBadges, MoreMenu } from "./more-menu";
import { TourTrigger } from "./guided-tour";

export interface AppConfig {
  paypalMode: "sandbox" | "simulated";
  aiMode: "model" | "fallback";
}

interface AppState {
  traders: Trader[];
  config?: AppConfig;
  traderId: TraderId;
  setTraderId: (id: TraderId) => void;
  name: (id: TraderId | null | undefined) => string;
  debts: ReturnType<typeof useApi<Debt[]>>; // shared list: reload it after a change
  pendingCount: number;
  refreshPending: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const app = useContext(AppContext);
  if (!app) throw new Error("useApp must be used inside AppProvider");
  return app;
}

// The "view as" trader lives in localStorage so it survives page changes and reloads.
const KEY = "alamino.trader";
const DEFAULT_TRADER = "soa";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function setTraderId(id: TraderId) {
  localStorage.setItem(KEY, id);
  listeners.forEach((cb) => cb());
}

export function AppProvider({ children }: { children: ReactNode }) {
  const traderId = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(KEY) ?? DEFAULT_TRADER,
    () => DEFAULT_TRADER,
  );
  const traders = useApi<Trader[]>("/api/traders").data ?? [];
  const config = useApi<AppConfig>("/api/config").data;
  const debts = useApi<Debt[]>("/api/debts");

  const value: AppState = {
    traders,
    config,
    traderId,
    setTraderId,
    name: (id) => traders.find((t) => t.id === id)?.name ?? id ?? "Unknown",
    debts,
    pendingCount: (debts.data ?? []).filter((d) => waitingFor(d, traderId)).length,
    refreshPending: debts.reload,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

const links = [
  { href: "/", label: "Market", tour: "market" },
  { href: "/add", label: "Add a debt", tour: "add" },
  { href: "/confirm", label: "Confirm", tour: "confirm" },
  { href: "/rounds/latest", label: "Payments", tour: "payments" },
  { href: "/statement", label: "Statement", tour: "statement" },
  { href: "/finance", label: "AI Finance", tour: "finance" },
];

function NavLinks({ pathname }: { pathname: string }) {
  const { pendingCount } = useApp();
  return (
    <nav aria-label="Main" className="main-nav">
      {links.map(({ href, label, tour }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href.replace("/latest", ""));
        return (
          <Link
            key={href}
            href={href}
            data-tour={tour}
            aria-current={active ? "page" : undefined}
            className="nav-link"
          >
            {label}
            {href === "/confirm" && pendingCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
                {pendingCount}
                <span className="sr-only"> waiting for you</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Nav() {
  return <NavLinks pathname={usePathname()} />;
}

export function Header() {
  const { traders, traderId } = useApp();
  return (
    <header className="site-header">
      <div className="header-content">
        <div className="header-top">
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/" aria-label="Alamino home"><Brand preload /></Link>
            <span className="hidden border-l border-zinc-200 pl-4 text-xs text-zinc-500 lg:inline">A clearer way to settle together.</span>
          </div>
          <div className="header-actions">
            <div className="header-badges"><ModeBadges /></div>
            <div className="profile-control">
              <label htmlFor="view-as" className="text-xs text-zinc-600 max-sm:sr-only">
                View as
              </label>
              <select
                id="view-as"
                data-tour="profile"
                value={traderId}
                onChange={(e) => setTraderId(e.target.value)}
                className="profile-select"
              >
                {traders.length === 0 && <option value={traderId}>{traderId}</option>}
                {traders.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.business})
                  </option>
                ))}
              </select>
            </div>
            <TourTrigger />
            <MoreMenu />
            <Bell />
          </div>
        </div>
        <Suspense fallback={<NavLinks pathname="" />}>
          <Nav />
        </Suspense>
      </div>
    </header>
  );
}
