import { connection, type NextRequest } from "next/server";
import { errorResponse, getRound, latestRound, listDebts, listTraders } from "@/lib/db";
import { requireTraderOrHouse } from "@/lib/privacy";
import { buildStatement, explainRound } from "@/lib/ai/explain";

// One trader's statement for a round. `latest` is allowed as the round id.
// `?text=plain` returns the plain-code statement at once, with no model call.
// Only that trader or the house can read it.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; traderId: string }> }) {
  await connection(); // always run at request time, never prerender
  const { id, traderId } = await ctx.params;
  try { requireTraderOrHouse(req, traderId); } catch (e) { return errorResponse(e); }
  const round = id === "latest" ? latestRound() : getRound(id);
  if (!round) return Response.json({ error: "Unknown round." }, { status: 404 });
  const traders = listTraders();
  if (!traders.some((t) => t.id === traderId)) return Response.json({ error: "Unknown trader." }, { status: 404 });
  const plain = req.nextUrl.searchParams.get("text") === "plain";
  return Response.json(plain ? buildStatement(round, traderId, listDebts(), traders) : await explainRound(round, traderId, listDebts(), traders));
}
