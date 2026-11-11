// Suggests how two traders can agree on a disputed debt. Both sides still approve.
import type { Debt, Trader } from "../types.ts";
import { aiMode, askJson, isObject, nullable, usd } from "./model.ts";

export interface Resolution {
  suggestion: string;
  proposedAmountCents: number | null;
}

// The two claims: the side in counterBy gave counterAmountCents, the other side gave amountCents.
function claims(debt: Debt, traders: Trader[]) {
  const name = (id: string) => traders.find((t) => t.id === id)?.name ?? id;
  const counterSide = debt.counterBy ?? debt.creditorId;
  const otherSide = counterSide === debt.debtorId ? debt.creditorId : debt.debtorId;
  return {
    debtor: name(debt.debtorId),
    creditor: name(debt.creditorId),
    a: { who: name(otherSide), cents: debt.amountCents },
    b: { who: name(counterSide), cents: debt.counterAmountCents ?? debt.amountCents },
  };
}

// Checks the model output. The proposal must be one of the two claimed amounts, or null.
export function validateResolution(raw: unknown, debt: Debt): Resolution {
  if (!isObject(raw) || typeof raw.suggestion !== "string" || !raw.suggestion.trim())
    throw new Error("Invalid resolve output: no suggestion");
  const p = raw.proposedAmountCents;
  if (p !== null && p !== debt.amountCents && p !== debt.counterAmountCents)
    throw new Error(`Invalid resolve output: ${String(p)} is not one of the two claimed amounts`);
  return { suggestion: raw.suggestion.trim(), proposedAmountCents: p as number | null };
}

// ponytail: neutral template without AI_API_KEY. It never proposes an amount.
export function fallbackResolution(debt: Debt, traders: Trader[]): Resolution {
  const c = claims(debt, traders);
  return {
    suggestion: `${c.a.who} says ${usd(c.a.cents)} and ${c.b.who} says ${usd(c.b.cents)}. Check the notebook or the receipt together, then approve the correct amount.`,
    proposedAmountCents: null,
  };
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestion", "proposedAmountCents"],
  properties: { suggestion: { type: "string" }, proposedAmountCents: nullable("integer") },
};

export async function resolveMismatch(debt: Debt, traders: Trader[]): Promise<Resolution> {
  if (aiMode() === "model" && debt.counterAmountCents !== undefined) {
    const c = claims(debt, traders);
    try {
      const raw = await askJson(
        [
          "Two market traders disagree on the amount of one debt. Help them agree.",
          "Write one or two short, plain, neutral sentences. Ask the one question that can settle the difference, for example about a delivery, a partial payment or a price.",
          `Set proposedAmountCents to ${c.a.cents} or ${c.b.cents} only if the note clearly supports that amount. Else set it to null. Never invent another amount.`,
        ].join("\n"),
        [
          {
            type: "text",
            text: `${c.debtor} owes ${c.creditor}. Note: "${debt.note}".\n${c.a.who} says ${usd(c.a.cents)} (${c.a.cents} cents).\n${c.b.who} says ${usd(c.b.cents)} (${c.b.cents} cents).`,
          },
        ],
        SCHEMA,
      );
      return validateResolution(raw, debt);
    } catch (e) {
      console.error("resolveMismatch: model call failed, using the fallback.", e);
    }
  }
  return fallbackResolution(debt, traders);
}
