import { connection } from "next/server";
import { getRound, latestRound } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const round = id === "latest" ? latestRound() : getRound(id);
  if (!round) return Response.json({ error: id === "latest" ? "No round yet" : `No round ${id}` }, { status: 404 });
  return Response.json(round);
}
