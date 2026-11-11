import { connection } from "next/server";
import { errorResponse, listDebts } from "@/lib/db";
import { clear } from "@/lib/netting";

// What a clearing round would do now. Saves nothing. clear() sums debts per pair, like runRound.
export async function GET() {
  await connection();
  try {
    const debts = listDebts("confirmed");
    if (debts.length === 0) return Response.json({ stats: null });
    const { stats } = clear(debts.map((d) => ({ debtorId: d.debtorId, creditorId: d.creditorId, amountCents: d.remainingCents })));
    return Response.json({ stats });
  } catch (e) {
    return errorResponse(e);
  }
}
