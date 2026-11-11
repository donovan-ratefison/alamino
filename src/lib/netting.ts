// Netting engine. Pure functions, integer cents, no AI and no I/O.
//
// Stage 1: cancel circles. A owes B, B owes C, C owes A: the smallest amount
//          on the circle is removed from every debt on it. No money moves.
// Stage 2: net positions. Whoever still owes more than they are owed pays the
//          difference into the clearing account. Whoever is owed more is paid
//          out of it.

import type { Cancellation, ClearingResult, Edge, Position, TraderId } from "./types.ts";

type Graph = Map<TraderId, Map<TraderId, number>>;

function buildGraph(edges: Edge[]): Graph {
  const g: Graph = new Map();
  for (const e of edges) {
    if (!Number.isInteger(e.amountCents) || e.amountCents < 0) {
      throw new Error(`amountCents must be a non-negative integer: ${e.amountCents}`);
    }
    if (e.debtorId === e.creditorId) {
      throw new Error(`a trader cannot owe themselves: ${e.debtorId}`);
    }
    if (e.amountCents === 0) continue;
    if (!g.has(e.debtorId)) g.set(e.debtorId, new Map());
    if (!g.has(e.creditorId)) g.set(e.creditorId, new Map());
    const out = g.get(e.debtorId)!;
    out.set(e.creditorId, (out.get(e.creditorId) ?? 0) + e.amountCents);
  }
  return g;
}

// Returns one circle as a list of traders, or null if there is none.
// Traders and neighbours are visited in sorted order so results are repeatable.
function findCircle(g: Graph): TraderId[] | null {
  const state = new Map<TraderId, 0 | 1 | 2>(); // 0 new, 1 on stack, 2 done
  const stack: TraderId[] = [];

  const visit = (node: TraderId): TraderId[] | null => {
    state.set(node, 1);
    stack.push(node);
    const neighbours = [...(g.get(node)?.keys() ?? [])].sort();
    for (const next of neighbours) {
      const s = state.get(next) ?? 0;
      if (s === 1) return stack.slice(stack.indexOf(next));
      if (s === 0) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(node, 2);
    return null;
  };

  for (const node of [...g.keys()].sort()) {
    if ((state.get(node) ?? 0) === 0) {
      const found = visit(node);
      if (found) return found;
    }
  }
  return null;
}

function cancelCircles(g: Graph): Cancellation[] {
  const cancellations: Cancellation[] = [];
  for (;;) {
    const path = findCircle(g);
    if (!path) return cancellations;
    let min = Infinity;
    for (let i = 0; i < path.length; i++) {
      const from = path[i];
      const to = path[(i + 1) % path.length];
      min = Math.min(min, g.get(from)!.get(to)!);
    }
    for (let i = 0; i < path.length; i++) {
      const from = path[i];
      const to = path[(i + 1) % path.length];
      const left = g.get(from)!.get(to)! - min;
      if (left === 0) g.get(from)!.delete(to);
      else g.get(from)!.set(to, left);
    }
    cancellations.push({ path, amountCents: min });
  }
}

function toEdges(g: Graph): Edge[] {
  const edges: Edge[] = [];
  for (const debtorId of [...g.keys()].sort()) {
    const out = g.get(debtorId)!;
    for (const creditorId of [...out.keys()].sort()) {
      edges.push({ debtorId, creditorId, amountCents: out.get(creditorId)! });
    }
  }
  return edges;
}

export function positionsOf(edges: Edge[], traders: TraderId[] = []): Position[] {
  const net = new Map<TraderId, number>();
  for (const t of traders) net.set(t, 0);
  for (const e of edges) {
    net.set(e.debtorId, (net.get(e.debtorId) ?? 0) - e.amountCents);
    net.set(e.creditorId, (net.get(e.creditorId) ?? 0) + e.amountCents);
  }
  return [...net.keys()].sort().map((traderId) => ({ traderId, netCents: net.get(traderId)! }));
}

export function clear(debts: Edge[]): ClearingResult {
  const g = buildGraph(debts);
  const traders = [...g.keys()];
  const grossCents = debts.reduce((sum, e) => sum + e.amountCents, 0);

  const cancellations = cancelCircles(g);
  const remaining = toEdges(g);
  const remainingCents = remaining.reduce((sum, e) => sum + e.amountCents, 0);

  const positions = positionsOf(remaining, traders);
  const payIns = positions
    .filter((p) => p.netCents < 0)
    .map((p) => ({ traderId: p.traderId, amountCents: -p.netCents }));
  const payOuts = positions
    .filter((p) => p.netCents > 0)
    .map((p) => ({ traderId: p.traderId, amountCents: p.netCents }));
  const cashMovedCents = payIns.reduce((sum, p) => sum + p.amountCents, 0);

  return {
    cancellations,
    remaining,
    positions,
    payIns,
    payOuts,
    stats: {
      grossCents,
      clearedByCirclesCents: grossCents - remainingCents,
      remainingCents,
      cashMovedCents,
      savedPct: grossCents === 0 ? 0 : Math.round((1 - cashMovedCents / grossCents) * 1000) / 10,
    },
  };
}
