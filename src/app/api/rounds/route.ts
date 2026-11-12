import { errorResponse } from "@/lib/db";
import { requireAdmin, sameOrigin } from "@/lib/finance/auth";
import { paypalMode } from "@/lib/paypal/client";
import { requireHouse } from "@/lib/privacy";
import { runRound } from "@/lib/rounds";

// Runs clearing. House only. In sandbox mode only the signed-in operator runs it.
export async function POST(req: Request) {
  try {
    requireHouse(req);
    if (paypalMode() === "sandbox") { sameOrigin(req); requireAdmin(req); }
    return Response.json(runRound());
  } catch (e) {
    return errorResponse(e);
  }
}
