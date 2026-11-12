"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, Suspense, useContext, useSyncExternalStore, type ReactNode } from "react";
import { HOUSE, type Debt, type Trader, type TraderId, type Viewer } from "@/lib/types";
import { useApi, VIEWER_KEY, waitingFor } from "./api";
import { Brand } from "./brand";
import { Bell } from "./bell";
import { MoreMenu } from "./more-menu";
import { TourTrigger } from "./guided-tour";
import { TraderChip } from "./trader-chip";

export interface AppConfig {
  paypalMode: "sandbox" | "simulated";
  aiMode: "model" | "fallback";
}

interface AppState {
  traders: Trader[];
  config?: AppConfig;
  traderId: Viewer; // a trader id, or HOUSE for the clearing house
  setTraderId: (v: Viewer) => void;
  isHouse: boolean;
  name: (id: TraderId | null | undefined) => string;
  debts: ReturnType<typeof useApi<Debt[]>>; // shared list, already filtered for the viewer: reload it after a change
  pendingCount: number;
  refreshPending: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const app = useContext(AppContext);
  if (!app) throw new Error("useApp must be used inside AppProvider");
  return app;
}

// The "view as" choice lives in localStorage so it survives page changes and reloads.
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function setTraderId(v: Viewer) {
  localStorage.setItem(VIEWER_KEY, v);
  listeners.forEach((cb) => cb());
}

export function AppProvider({ children }: { children: ReactNode }) {
  const traderId = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(VIEWER_KEY) ?? HOUSE,
    () => HOUSE,
  );
  const traders = useApi<Trader[]>("/api/traders").data ?? [];
  const config = useApi<AppConfig>("/api/config").data;
  // The route ignores the query. It changes the path, so the list loads again for a new viewer.
  const debts = useApi<Debt[]>(`/api/debts?viewer=${traderId}`);

  const value: AppState = {
    traders,
    config,
    traderId,
    setTraderId,
    isHouse: traderId === HOUSE,
    name: (id) => (id === HOUSE ? "Clearing house" : traders.find((t) => t.id === id)?.name ?? id ?? "Unknown"),
    debts,
    pendingCount: (debts.data ?? []).filter((d) => waitingFor(d, traderId)).length, // always 0 for the house
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
  const { traders, traderId, isHouse, name } = useApp();
  return (
    <header className="site-header">
      <div className="header-content">
        <Link href="/" aria-label="Alamino home" className="shrink-0"><Brand preload /></Link>
        <Suspense fallback={<NavLinks pathname="" />}>
          <Nav />
        </Suspense>
        <div className="header-actions">
          <div className="profile-control">
            <label htmlFor="view-as" className="text-xs whitespace-nowrap text-zinc-600 max-xl:sr-only">
              View as
            </label>
            <span className="profile-field">
              <span className="profile-chip"><TraderChip id={traderId} name={name(traderId)} size={22} /></span>
              <select
                id="view-as"
                data-tour="profile"
                value={traderId}
                onChange={(e) => setTraderId(e.target.value)}
                className="profile-select"
              >
                <option value={HOUSE}>Clearing house</option>
                {traders.length === 0 && !isHouse && <option value={traderId}>{traderId}</option>}
                {traders.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </span>
          </div>
          <TourTrigger />
          <MoreMenu />
          {!isHouse && <Bell />}
        </div>
      </div>
    </header>
  );
}
