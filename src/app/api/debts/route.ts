import { connection, type NextRequest } from "next/server";
import {
  DEBT_SOURCES,
  DEBT_STATUSES,
  errorResponse,
  HttpError,
  insertDebt,
  listDebts,
  listTraders,
  MAX_AMOUNT_CENTS,
  newId,
  validAmount,
} from "@/lib/db";
import { debtsFor, requireTraderOrHouse, viewerOf } from "@/lib/privacy";
import type { DebtSource, DebtStatus } from "@/lib/types";

// A trader gets only their debts. The house gets all.
export async function GET(req: NextRequest) {
  await connection();
  try {
    const viewer = viewerOf(req);
    const status = req.nextUrl.searchParams.get("status") || undefined;
    if (status && !DEBT_STATUSES.includes(status as DebtStatus)) {
      throw new HttpError(400, `status must be one of ${DEBT_STATUSES.join(", ")}`);
    }
    return Response.json(debtsFor(listDebts(status as DebtStatus | undefined), viewer));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw new HttpError(400, "Body must be a JSON object");
    const { debtorId, creditorId, amountCents, note = "", source, createdBy } = body;

    if (typeof debtorId !== "string" || typeof creditorId !== "string") {
      throw new HttpError(400, "debtorId and creditorId are required");
    }
    const known = new Set(listTraders().map((t) => t.id));
    for (const id of [debtorId, creditorId]) if (!known.has(id)) throw new HttpError(404, `No trader ${id}`);
    if (debtorId === creditorId) throw new HttpError(400, "A trader cannot owe themselves");
    if (!validAmount(amountCents)) {
      throw new HttpError(400, `amountCents must be an integer from 1 to ${MAX_AMOUNT_CENTS}`);
    }
    if (typeof note !== "string" || note.length > 200) throw new HttpError(400, "note must be text of 200 characters or less");
    if (!DEBT_SOURCES.includes(source)) throw new HttpError(400, `source must be one of ${DEBT_SOURCES.join(", ")}`);
    requireTraderOrHouse(req, createdBy);
    if (createdBy !== debtorId && createdBy !== creditorId) {
      throw new HttpError(400, "createdBy must be the debtor or the creditor");
    }

    const debt = insertDebt({
      id: newId("d"),
      debtorId,
      creditorId,
      amountCents,
      remainingCents: amountCents,
      note: note.trim(),
      source: source as DebtSource,
      status: "proposed",
      debtorOk: createdBy === debtorId,
      creditorOk: createdBy === creditorId,
      createdAt: new Date().toISOString(),
    });
    return Response.json(debt, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
