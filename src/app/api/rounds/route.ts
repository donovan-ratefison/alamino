import { errorResponse } from "@/lib/db";
import { runRound } from "@/lib/rounds";

export async function POST() {
  try {
    return Response.json(runRound());
  } catch (e) {
    return errorResponse(e);
  }
}
