import { connection } from "next/server";
import { financeError, readBody, requireAdmin, sameOrigin } from "@/lib/finance/auth";
import { readDashboard, writeDashboard } from "@/lib/finance/store";
import { HttpError } from "@/lib/db";

export async function GET(req: Request) {
  await connection();
  try { requireAdmin(req); return Response.json({ state: readDashboard() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return financeError(e); }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req); requireAdmin(req);
    const { state } = await readBody(req, 500000);
    if (!state || typeof state !== "object" || !Array.isArray((state as { pages?: unknown }).pages) || (state as { pages: unknown[] }).pages.length > 30) throw new HttpError(400, "Invalid Studio report state.");
    writeDashboard(state); return Response.json({ ok: true });
  } catch (e) { return financeError(e); }
}
