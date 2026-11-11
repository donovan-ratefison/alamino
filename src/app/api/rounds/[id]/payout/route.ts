import { getRound, listTraders, setRoundStatus, updateSettlement } from "@/lib/db";
import { paypalMode } from "@/lib/paypal/client";
import { createPayoutBatch } from "@/lib/paypal/payments";

// Sends one payout batch for the round, only when every pay-in is captured.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const round = getRound(id);
  if (!round) return Response.json({ error: "Unknown round." }, { status: 404 });
  if (round.status === "paying" || round.status === "done") return Response.json(round);
  if (round.settlements.some((s) => s.direction === "pay_in" && s.status !== "captured"))
    return Response.json({ error: "Every pay-in must be captured before the payouts." }, { status: 409 });

  const payOuts = round.settlements.filter((s) => s.direction === "pay_out");
  try {
    let batchId = `SIM-${id}`;
    // ponytail: simulated mode marks the payouts sent with no network. Set the PayPal keys for the sandbox.
    if (paypalMode() === "sandbox") {
      const traders = listTraders();
      const items = payOuts.map((s) => {
        const email = traders.find((t) => t.id === s.traderId)?.paypalEmail;
        if (!email) throw new Error(`Trader ${s.traderId} has no PayPal email.`);
        return { traderId: s.traderId, email, amountCents: s.amountCents };
      });
      batchId = await createPayoutBatch(id, items);
    }
    for (const s of payOuts) updateSettlement(id, s.traderId, { status: "sent", paypalPayoutBatchId: batchId });
    return Response.json(setRoundStatus(id, "paying"));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "PayPal payout failed." }, { status: 502 });
  }
}
