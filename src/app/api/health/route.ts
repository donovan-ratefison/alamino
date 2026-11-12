import { connection } from "next/server";
import { db } from "@/lib/db";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export async function GET() {
  await connection();
  const headers = { "Cache-Control": "no-store, max-age=0" };
  try {
    let commit = "unmanaged";
    try { commit = readFileSync(join(process.cwd(), ".deploy-sha"), "utf8").trim(); } catch { /* Local development has no release marker. */ }
    if (process.env.DEPLOY_SHA && process.env.DEPLOY_SHA !== commit) throw new Error("Release mismatch");
    db().prepare("SELECT 1").get();
    return Response.json({ status: "ok", commit }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
