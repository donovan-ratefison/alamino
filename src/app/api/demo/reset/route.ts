import { errorResponse } from "@/lib/db";
import { reset } from "@/lib/seed";

export async function POST() {
  try {
    reset();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
