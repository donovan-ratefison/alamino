import { connection } from "next/server";
import { getRound, latestRound, listDebts, listTraders } from "@/lib/db";
import { explainRound } from "@/lib/ai/explain";

// One trader's statement for a round. `latest` is allowed as the round id.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; traderId: string }> }) {
  await connection(); // always run at request time, never prerender
  const { id, traderId } = await ctx.params;
  const round = id === "latest" ? latestRound() : getRound(id);
  if (!round) return Response.json({ error: "Unknown round." }, { status: 404 });
  const traders = listTraders();
  if (!traders.some((t) => t.id === traderId)) return Response.json({ error: "Unknown trader." }, { status: 404 });
  return Response.json(await explainRound(round, traderId, listDebts(), traders));
}
