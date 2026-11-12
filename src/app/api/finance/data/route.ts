import { connection } from "next/server";
import { requireHouse } from "@/lib/privacy";
import { financeError, rateLimit, requireAdmin } from "@/lib/finance/auth";
import { dateRange } from "@/lib/finance/metrics";
import { financeSnapshot } from "@/lib/finance/service";
import { HttpError } from "@/lib/db";

export async function GET(req: Request) {
  await connection();
  try {
    const q = new URL(req.url).searchParams;
    const source = q.get("source") ?? "ledger";
    if (source !== "ledger" && source !== "demo" && source !== "sandbox") throw new HttpError(400, "Invalid data source.");
    requireHouse(req);
    if (source === "sandbox") { requireAdmin(req); rateLimit("finance-sync", 20); }
    let range; try { range = dateRange(q.get("start"), q.get("end")); } catch (e) { throw new HttpError(400, (e as Error).message); }
    const result = await financeSnapshot(source, range.start, range.end, q.get("refresh") === "1");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return financeError(e); }
}
