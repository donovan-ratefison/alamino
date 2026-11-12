import { getDebt, listTraders } from "@/lib/db";
import { resolveMismatch } from "@/lib/ai/resolve";
import { viewerOf } from "@/lib/privacy";
import { HOUSE } from "@/lib/types";

// Suggests how to settle a disputed amount. It changes nothing.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const debt = getDebt(id);
  if (!debt) return Response.json({ error: "Unknown debt." }, { status: 404 });
  const viewer = viewerOf(req);
  if (viewer !== HOUSE && viewer !== debt.debtorId && viewer !== debt.creditorId) return Response.json({ error: "You can only see your own debts." }, { status: 403 });
  if (debt.status !== "disputed") return Response.json({ error: "Only a disputed debt can get a suggestion." }, { status: 409 });
  return Response.json(await resolveMismatch(debt, listTraders()));
}
