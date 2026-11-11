"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, Suspense, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { Debt, Trader, TraderId } from "@/lib/types";
import { useApi, waitingFor } from "./api";
import { Badge } from "./ui";

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
    pendingCount: (debts.data ?? []).filter((d) => waitingFor(d, traderId)).length,
    refreshPending: debts.reload,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

const links = [
  { href: "/", label: "Market" },
  { href: "/add", label: "Add" },
  { href: "/confirm", label: "Confirm" },
  { href: "/rounds/latest", label: "Round" },
  { href: "/statement", label: "Statement" },
];

function NavLinks({ pathname }: { pathname: string }) {
  const { pendingCount } = useApp();
  return (
    <nav aria-label="Main" className="-mb-px flex gap-1 overflow-x-auto">
      {links.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href.replace("/latest", ""));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
              active ? "border-accent font-medium text-zinc-900" : "border-transparent text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {label}
            {href === "/confirm" && pendingCount > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-xs font-medium leading-5 text-white">
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
  const { traders, traderId, config } = useApp();
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3 pb-2">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="text-base font-semibold text-zinc-900">
              Alamino
            </Link>
            <span className="hidden text-sm text-zinc-500 sm:inline">Debt clearing for the market</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {config?.paypalMode === "simulated" && <Badge>PayPal simulated</Badge>}
            {config?.aiMode === "fallback" && <Badge>AI fallback</Badge>}
            <label htmlFor="view-as" className="text-sm text-zinc-600">
              View as
            </label>
            <select
              id="view-as"
              value={traderId}
              onChange={(e) => setTraderId(e.target.value)}
              className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-sm"
            >
              {traders.length === 0 && <option value={traderId}>{traderId}</option>}
              {traders.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.business})
                </option>
              ))}
            </select>
          </div>
        </div>
        <Suspense fallback={<NavLinks pathname="" />}>
          <Nav />
        </Suspense>
      </div>
    </header>
  );
}
