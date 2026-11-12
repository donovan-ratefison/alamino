import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { HttpError } from "../db.ts";

const COOKIE = "alamino-finance";
const lifetime = 8 * 3600;
const signature = (text: string) => createHmac("sha256", process.env.FINANCE_ADMIN_PASSWORD ?? "").update(text).digest("hex");
export const configured = () => (process.env.FINANCE_ADMIN_PASSWORD?.length ?? 0) >= 16;
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function authenticated(req: Request): boolean {
  if (!configured()) return false;
  const cookie = req.headers.get("cookie")?.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!cookie) return false;
  const [expiry, nonce, sig] = cookie.split(".");
  return !!sig && /^\d+$/.test(expiry) && Number(expiry) > Date.now() && Number(expiry) <= Date.now() + lifetime * 1000 && safeEqual(sig, signature(`${expiry}.${nonce}`));
}
export function requireAdmin(req: Request) {
  if (!authenticated(req)) throw new HttpError(401, "Sign in on the Finance page as the clearing house operator.");
}
// The host the browser used. Behind a proxy or on a network address, req.url holds
// an internal host, so the Host and X-Forwarded-Host headers are checked too.
function hosts(req: Request): (string | null)[] {
  return [new URL(req.url).host, req.headers.get("host"), req.headers.get("x-forwarded-host")?.split(",")[0].trim() ?? null];
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = origin && URL.canParse(origin) ? new URL(origin).host : null;
  if (!host || !hosts(req).includes(host)) throw new HttpError(403, "This action must come from the application.");
}
export function sessionCookie(req: Request, clear = false): string {
  const value = `${Date.now() + lifetime * 1000}.${randomBytes(16).toString("hex")}`;
  return `${COOKIE}=${clear ? "" : `${value}.${signature(value)}`}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${clear ? 0 : lifetime}${new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https" ? "; Secure" : ""}`;
}

const windows = new Map<string, { count: number; until: number }>();
export function rateLimit(key: string, limit: number, ms = 60000) {
  const now = Date.now();
  if (windows.size > 1000) for (const [k, v] of windows) if (v.until < now) windows.delete(k);
  const w = windows.get(key);
  if (w && w.until > now) { if (++w.count > limit) throw new HttpError(429, "Too many requests. Please try again later."); }
  else windows.set(key, { count: 1, until: now + ms });
}
export function financeError(e: unknown): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error("Finance request failed:", e instanceof Error ? e.name : "Unknown error");
  return Response.json({ error: "The finance service could not complete this request. Check server configuration and try again." }, { status: 502 });
}
export async function readBody(req: Request, max = 100000): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "A JSON body is required.");
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > max) { await reader.cancel(); throw new HttpError(413, "Request is too large."); } chunks.push(value); }
  try { const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); return parsed; }
  catch { throw new HttpError(400, "A JSON object is required."); }
}
