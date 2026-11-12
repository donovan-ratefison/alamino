import { connection } from "next/server";
import { errorResponse, listDebts } from "@/lib/db";
import { previewFor, viewerOf } from "@/lib/privacy";

// What a clearing round would do now. Saves nothing.
// House: market stats. Trader: own stats, plus what they would pay in or receive.
export async function GET(req: Request) {
  await connection();
  try {
    const viewer = viewerOf(req);
    const edges = listDebts("confirmed").map((d) => ({ debtorId: d.debtorId, creditorId: d.creditorId, amountCents: d.remainingCents }));
    return Response.json(previewFor(edges, viewer));
  } catch (e) {
    return errorResponse(e);
  }
}
