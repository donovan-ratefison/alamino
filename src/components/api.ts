import { useCallback, useEffect, useState } from "react";
import { HOUSE, type Debt, type TraderId, type Viewer } from "@/lib/types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// The "view as" choice. The header selector writes it, every API call sends it.
export const VIEWER_KEY = "alamino.trader";

function viewer(): Viewer {
  try {
    return localStorage.getItem(VIEWER_KEY) ?? HOUSE;
  } catch {
    return HOUSE; // no localStorage: server render, or storage blocked
  }
}

// GET when body is undefined, else POST with a JSON body. Throws the `{ error }` text.
// Sends the current viewer in `x-alamino-viewer`: the server returns only what this viewer may see.
export async function api<T>(path: string, body?: object): Promise<T> {
  const headers: Record<string, string> = { "x-alamino-viewer": viewer() };
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  trailingZeroDisplay: "stripIfInteger",
});

export function formatUsd(cents: number): string {
  return usd.format(cents / 100);
}

// Loads `path` on mount and when `path` changes. `path = null` loads nothing.
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; data?: T; error?: ApiError }>({ path: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path).then(
      (data) => live && setState({ path, data }),
      (error) => live && setState({ path, error: error instanceof ApiError ? error : new ApiError(String(error), 0) }),
    );
    return () => {
      live = false;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const set = useCallback((data: T) => setState({ path, data }), [path]);
  const current = state.path === path;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: path !== null && !current,
    reload,
    set,
  };
}

// True when the debt needs an action from this trader on /confirm.
export function waitingFor(debt: Debt, traderId: TraderId): boolean {
  if (debt.debtorId !== traderId && debt.creditorId !== traderId) return false;
  if (debt.status === "disputed") return debt.counterBy !== traderId;
  if (debt.status === "proposed") return debt.debtorId === traderId ? !debt.debtorOk : !debt.creditorOk;
  return false;
}

// "12.50" -> 1250. Null when the text is not a positive amount with at most 2 decimals.
export function toCents(amount: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) return null;
  const cents = Math.round(Number(amount) * 100);
  return cents > 0 ? cents : null;
}
