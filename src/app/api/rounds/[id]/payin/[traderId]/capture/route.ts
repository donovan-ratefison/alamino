import { financeError, requireAdmin, sameOrigin } from "@/lib/finance/auth";
import { getRound, updateSettlement } from "@/lib/db";
import { paypalMode } from "@/lib/paypal/client";
import { captureMatches, captureOrder, toUsd } from "@/lib/paypal/payments";

const payIn = (round: ReturnType<typeof getRound>, traderId: string) =>
  round?.settlements.find((x) => x.traderId === traderId && x.direction === "pay_in");

// Captures an approved order and checks that PayPal took exactly the planned amount.
export async function POST(req: Request, ctx: { params: Promise<{ id: string; traderId: string }> }) {
  try { if (paypalMode() === "sandbox") { sameOrigin(req); requireAdmin(req); } } catch (e) { return financeError(e); }
  const { id, traderId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { orderId?: unknown } | null;
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  if (!orderId) return Response.json({ error: "orderId is required." }, { status: 400 });

  const s = payIn(getRound(id), traderId);
  if (!s) return Response.json({ error: "Unknown round, or this trader has no pay-in." }, { status: 404 });
  if (s.status === "captured") return Response.json(s);
  if (orderId !== s.paypalOrderId)
    return Response.json({ error: "This order does not belong to this pay-in." }, { status: 400 });

  try {
    // ponytail: simulated mode marks the pay-in captured with no network. Set the PayPal keys for the sandbox.
    if (paypalMode() === "sandbox") {
      const res = await captureOrder(orderId);
      if (!captureMatches(res, s.amountCents)) {
        console.error(`Capture mismatch for ${id}:${traderId}`, JSON.stringify(res));
        updateSettlement(id, traderId, { status: "failed" });
        return Response.json(
          { error: `PayPal did not capture exactly $${toUsd(s.amountCents)} USD. The pay-in is marked failed.` },
          { status: 409 },
        );
      }
    }
    return Response.json(payIn(updateSettlement(id, traderId, { status: "captured" }), traderId));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "PayPal capture failed." }, { status: 502 });
  }
}
