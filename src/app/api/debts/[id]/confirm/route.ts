import { confirmDebt, errorResponse, HttpError } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => null);
    const { traderId, ok, counterAmountCents } = body ?? {};
    if (typeof traderId !== "string" || typeof ok !== "boolean") {
      throw new HttpError(400, "Body must be { traderId: string, ok: boolean, counterAmountCents?: number }");
    }
    return Response.json(confirmDebt(id, traderId, ok, counterAmountCents ?? undefined));
  } catch (e) {
    return errorResponse(e);
  }
}
