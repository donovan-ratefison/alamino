import { getRound, updateSettlement } from "@/lib/db";
import { finishRound } from "@/lib/rounds";
import { paypalMode } from "@/lib/paypal/client";
import { getPayoutBatch, payoutUpdates } from "@/lib/paypal/payments";

// Reads the payout batch from PayPal and updates each pay-out. Finishes the round when all are confirmed.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const round = getRound(id);
  if (!round) return Response.json({ error: "Unknown round." }, { status: 404 });
  if (round.status === "done") return Response.json(round);
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
    return Response.json(allConfirmed ? finishRound(id) : latest);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "PayPal payout refresh failed." }, { status: 502 });
  }
}
