import { financeError, requireAdmin, sameOrigin } from "@/lib/finance/auth";
import { getRound, updateSettlement } from "@/lib/db";
import { paypalMode } from "@/lib/paypal/client";
import { createOrder } from "@/lib/paypal/payments";

// Creates the PayPal order for one pay-in. The amount comes from the round, never from the browser.
export async function POST(req: Request, ctx: { params: Promise<{ id: string; traderId: string }> }) {
  try { if (paypalMode() === "sandbox") { sameOrigin(req); requireAdmin(req); } } catch (e) { return financeError(e); }
  const { id, traderId } = await ctx.params;
  const s = getRound(id)?.settlements.find((x) => x.traderId === traderId && x.direction === "pay_in");
  if (!s) return Response.json({ error: "Unknown round, or this trader has no pay-in." }, { status: 404 });
  if (s.status === "captured") return Response.json({ error: "This pay-in is already captured." }, { status: 409 });

  try {
    // ponytail: simulated mode makes a fake order id and calls no network. Set the PayPal keys for the sandbox.
    const orderId =
      paypalMode() === "sandbox" ? await createOrder(id, traderId, s.amountCents) : `SIM-${id}-${traderId}`;
    updateSettlement(id, traderId, { status: "pending", paypalOrderId: orderId });
    return Response.json({ orderId });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "PayPal order failed." }, { status: 502 });
  }
}
