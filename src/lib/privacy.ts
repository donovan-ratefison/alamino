// Privacy rules (issue #28). A trader sees only what touches them. The house sees the whole market.
// Relative imports keep the `.ts` extension so `npm test` can load this file.

import { HttpError, listTraders } from "./db.ts";
import { clear } from "./netting.ts";
import { HOUSE } from "./types.ts";
import type { Cancellation, ClearingResult, ClearingStats, Debt, Edge, Round, Statement, Viewer } from "./types.ts";

// Reads the `x-alamino-viewer` header. No header means the house.
// Every view is open to read: "View as" already shows every trader. In sandbox mode the
// house actions (run clearing, pay-ins, payouts) need the Finance sign-in on their routes.
export function viewerOf(req: Request): Viewer {
  const id = req.headers.get("x-alamino-viewer") || HOUSE;
  if (id !== HOUSE) {
    if (!listTraders().some((t) => t.id === id)) throw new HttpError(400, `Unknown viewer ${id}`);
    return id;
  }
  return HOUSE;
}

export function requireHouse(req: Request): void {
  if (viewerOf(req) !== HOUSE) throw new HttpError(403, "Only the clearing house can do this.");
}

export function requireTraderOrHouse(req: Request, traderId: string): void {
  const viewer = viewerOf(req);
  if (viewer !== HOUSE && viewer !== traderId) throw new HttpError(403, "You can only see or pay your own part.");
}

const touches = (e: Edge, viewer: Viewer) => e.debtorId === viewer || e.creditorId === viewer;
const sum = (edges: Edge[]) => edges.reduce((s, e) => s + e.amountCents, 0);

export function debtsFor(debts: Debt[], viewer: Viewer): Debt[] {
  return viewer === HOUSE ? debts : debts.filter((d) => touches(d, viewer));
}

// The viewer's own numbers: gross = their debts before (both ways), cashMoved = what they pay or receive.
function ownStats(before: Edge[], result: ClearingResult, viewer: Viewer): ClearingStats {
  const grossCents = sum(before.filter((e) => touches(e, viewer)));
  const remainingCents = sum(result.remaining.filter((e) => touches(e, viewer)));
  const cashMovedCents = Math.abs(result.positions.find((p) => p.traderId === viewer)?.netCents ?? 0);
  return {
    grossCents,
    clearedByCirclesCents: grossCents - remainingCents,
    remainingCents,
    cashMovedCents,
    savedPct: grossCents === 0 ? 0 : Math.round((1 - cashMovedCents / grossCents) * 1000) / 10,
  };
}

// A circle of 3 or more becomes [viewer, next, prev]: the part from next to prev is private.
function circleFor(c: Cancellation, viewer: Viewer): Cancellation {
  const n = c.path.length;
  if (n <= 2) return c;
  const i = c.path.indexOf(viewer);
  return { path: [viewer, c.path[(i + 1) % n], c.path[(i - 1 + n) % n]], amountCents: c.amountCents, hiddenTraders: n - 3 };
}

// `debts` holds at least the debts of the round, to know which debt changes are the viewer's.
export function roundFor(round: Round, viewer: Viewer, debts: Debt[]): Round {
  if (viewer === HOUSE) return round;
  const mine = (x: { traderId: string }) => x.traderId === viewer;
  const myDebtIds = new Set(debtsFor(debts, viewer).map((d) => d.id));
  const r = round.result;
  const others = round.settlements.filter((s) => s.direction === "pay_in" && !mine(s));
  return {
    ...round,
    debtsBefore: round.debtsBefore.filter((e) => touches(e, viewer)),
    result: {
      cancellations: r.cancellations.filter((c) => c.path.includes(viewer)).map((c) => circleFor(c, viewer)),
      remaining: r.remaining.filter((e) => touches(e, viewer)),
      positions: r.positions.filter(mine),
      payIns: r.payIns.filter(mine),
      payOuts: r.payOuts.filter(mine),
      stats: ownStats(round.debtsBefore, r, viewer),
    },
    settlements: round.settlements.filter(mine),
    debtChanges: round.debtChanges.filter((c) => myDebtIds.has(c.debtId)),
    privacy: { viewer, otherPayments: { total: others.length, done: others.filter((s) => s.status === "captured").length } },
  };
}

export interface Preview {
  stats: ClearingStats | null;
  action?: Statement["action"]; // trader view only
  amountCents?: number; // trader view only: what the viewer pays in or receives
}

// What a clearing round would do now with these confirmed debts. clear() sums debts per pair, like runRound.
export function previewFor(debts: Edge[], viewer: Viewer): Preview {
  const result = debts.length ? clear(debts) : null;
  if (viewer === HOUSE) return { stats: result?.stats ?? null };
  const net = result?.positions.find((p) => p.traderId === viewer)?.netCents ?? 0;
  return {
    stats: result && ownStats(debts, result, viewer),
    action: net < 0 ? "pay_in" : net > 0 ? "receive" : "nothing",
    amountCents: Math.abs(net),
  };
}
