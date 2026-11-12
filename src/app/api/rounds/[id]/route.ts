import { connection } from "next/server";
import { errorResponse, getRound, latestRound, listDebts } from "@/lib/db";
import { roundFor, viewerOf } from "@/lib/privacy";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const viewer = viewerOf(req);
    const { id } = await params;
    const round = id === "latest" ? latestRound() : getRound(id);
    if (!round) return Response.json({ error: id === "latest" ? "No round yet" : `No round ${id}` }, { status: 404 });
    return Response.json(roundFor(round, viewer, listDebts()));
  } catch (e) {
    return errorResponse(e);
  }
}
