import { addAlias, errorResponse } from "@/lib/db";

// Body { alias }: the capture matches this name to the trader from now on. Returns the Trader.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => null);
    return Response.json(addAlias(id, typeof body?.alias === "string" ? body.alias : ""));
  } catch (e) {
    return errorResponse(e);
  }
}
