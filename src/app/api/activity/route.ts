import { connection, type NextRequest } from "next/server";
import { listActivity } from "@/lib/activity";
import { errorResponse, HttpError } from "@/lib/db";
import { requireHouse } from "@/lib/privacy";

// The activity log, newest first. Clearing house only. `after` is the last id the client has.
export async function GET(req: NextRequest) {
  await connection();
  try {
    requireHouse(req);
    const after = req.nextUrl.searchParams.get("after") || "0";
    if (!/^\d+$/.test(after)) throw new HttpError(400, "after must be a whole number of 0 or more");
    return Response.json(listActivity(Number(after)), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
