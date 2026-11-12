import { financeError, requireAdmin, sameOrigin } from "@/lib/finance/auth";
import { getRound, listDebts, updateSettlement } from "@/lib/db";
import { roundFor, viewerOf } from "@/lib/privacy";
import type { Round, Viewer } from "@/lib/types";
import { finishRound } from "@/lib/rounds";
import { paypalMode } from "@/lib/paypal/client";
import { getPayoutBatch, payoutUpdates } from "@/lib/paypal/payments";

const view = (round: Round, viewer: Viewer) => Response.json(roundFor(round, viewer, listDebts()));

// Reads the payout batch from PayPal and updates each pay-out. Finishes the round when all are confirmed.
// Anyone can refresh. The answer is the round as the viewer sees it.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let viewer: Viewer;
  try { viewer = viewerOf(req); if (paypalMode() === "sandbox") { sameOrigin(req); requireAdmin(req); } } catch (e) { return financeError(e); }
  const { id } = await ctx.params;
  const round = getRound(id);
  if (!round) return Response.json({ error: "Unknown round." }, { status: 404 });
  if (round.status === "done") return view(round, viewer);
  if (round.status !== "paying") return Response.json({ error: "The payouts are not sent yet." }, { status: 409 });

  const payOuts = round.settlements.filter((s) => s.direction === "pay_out");
  try {
    // ponytail: simulated mode confirms every payout with no network. Set the PayPal keys for the sandbox.
    if (paypalMode() === "sandbox") {
      const batchId = payOuts.find((s) => s.paypalPayoutBatchId)?.paypalPayoutBatchId;
      if (!batchId) return Response.json({ error: "The round has no payout batch id." }, { status: 409 });
      const batch = await getPayoutBatch(batchId);
      for (const u of payoutUpdates(batch.items ?? [])) {
        if (payOuts.some((s) => s.traderId === u.traderId))
          updateSettlement(id, u.traderId, { status: u.status, paypalPayoutItemId: u.paypalPayoutItemId });
      }
    } else {
      for (const s of payOuts) updateSettlement(id, s.traderId, { status: "confirmed" });
    }
    const latest = getRound(id)!;
    const allConfirmed = latest.settlements.every((s) => s.direction !== "pay_out" || s.status === "confirmed");
    return view(allConfirmed ? finishRound(id) : latest, viewer);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "PayPal payout refresh failed." }, { status: 502 });
  }
}
