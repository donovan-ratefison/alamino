import { errorResponse } from "@/lib/db";
import { requireHouse } from "@/lib/privacy";
import { runRound } from "@/lib/rounds";

// Runs clearing. House only.
export async function POST(req: Request) {
  try {
    requireHouse(req);
    return Response.json(runRound());
  } catch (e) {
    return errorResponse(e);
  }
}
