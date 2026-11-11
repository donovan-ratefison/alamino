import { connection } from "next/server";
import { authenticated, configured, financeError, rateLimit, readBody, safeEqual, sameOrigin, sessionCookie } from "@/lib/finance/auth";
import { HttpError } from "@/lib/db";

export async function GET(req: Request) {
  await connection();
  return Response.json({ authenticated: authenticated(req), passwordConfigured: configured(), paypalConfigured: !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET), aiConfigured: !!process.env.AI_API_KEY }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  try {
    sameOrigin(req); rateLimit("finance-login", 10, 15 * 60000);
    if (!configured()) throw new HttpError(503, "Set FINANCE_ADMIN_PASSWORD to at least 16 characters on the server.");
    const body = await readBody(req, 2000);
    if (typeof body.password !== "string" || !safeEqual(body.password, process.env.FINANCE_ADMIN_PASSWORD!)) throw new HttpError(401, "Incorrect finance password.");
    return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(req), "Cache-Control": "no-store" } });
  } catch (e) { return financeError(e); }
}
export async function DELETE(req: Request) {
  try { sameOrigin(req); return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(req, true) } }); }
  catch (e) { return financeError(e); }
}
