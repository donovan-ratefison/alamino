// Turns a sentence or a notebook photo into draft debts. Nothing is saved here.
import type { DebtDraft, Trader, TraderId } from "../types.ts";
import { aiMode, askJson, isObject, nullable } from "./model.ts";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export interface CaptureInput {
  text?: string;
  imageBase64?: string; // raw base64, no data URL prefix
  mediaType?: ImageType;
  traders: Trader[];
  speakerId: TraderId;
}

const CONFIDENCE: DebtDraft["confidence"][] = ["high", "medium", "low"];
const DIRECTIONS = ["you_owe", "owed_to_you"] as const;

export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["drafts"],
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["counterpartyId", "counterpartyText", "direction", "amountCents", "note", "confidence", "question"],
        properties: {
          counterpartyId: nullable("string"),
          counterpartyText: { type: "string" },
          direction: { anyOf: [{ type: "string", enum: DIRECTIONS }, { type: "null" }] },
          amountCents: nullable("integer"),
          note: { type: "string" },
          confidence: { type: "string", enum: CONFIDENCE },
          question: nullable("string"),
        },
      },
    },
  },
};

// What the model and the fallback find. The debtor and creditor fields are derived from it.
type Found = Omit<DebtDraft, "debtorId" | "creditorId" | "debtorText" | "creditorText">;

function emptyDraft(question: string): DebtDraft {
  return {
    debtorId: null,
    creditorId: null,
    debtorText: "",
    creditorText: "",
    counterpartyId: null,
    counterpartyText: "",
    direction: null,
    amountCents: null,
    note: "",
    confidence: "low",
    question,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function matchTrader(text: string, traders: Trader[], speakerId: TraderId): TraderId | null {
  const t = norm(text);
  if (t === "i" || t === "me") return speakerId;
  const padded = ` ${t} `;
  const names = (tr: Trader) => [tr.name, ...tr.aliases].map(norm).filter(Boolean);
  return traders.find((tr) => names(tr).some((n) => padded.includes(` ${n} `)))?.id ?? null;
}

// The speaker is always one side. Derives debtor and creditor. The screen asks for a missing part:
// the question here is only the hint of the model or of the fallback.
function toDraft(f: Found, traders: Trader[], speakerId: TraderId): DebtDraft {
  const speakerName = traders.find((t) => t.id === speakerId)?.name ?? speakerId;
  const { question, ...rest } = f;
  const { counterpartyId: other, counterpartyText: text, direction } = f;
  const known = other && direction;
  return {
    ...rest,
    debtorId: known ? (direction === "you_owe" ? speakerId : other) : null,
    creditorId: known ? (direction === "you_owe" ? other : speakerId) : null,
    debtorText: direction === "you_owe" ? speakerName : direction === "owed_to_you" ? text : "",
    creditorText: direction === "owed_to_you" ? speakerName : text,
    confidence: !question && !(known && f.amountCents !== null) ? "low" : f.confidence,
    ...(question ? { question } : {}),
  };
}

function fail(message: string): never {
  throw new Error(`Invalid capture output: ${message}`);
}

// Checks the model output. Throws when the structure is wrong. A value the app cannot
// trust (a trader id, a direction, an amount) becomes null, and the draft gets a question.
export function validateDrafts(raw: unknown, traders: Trader[], speakerId: TraderId): DebtDraft[] {
  if (!isObject(raw) || !Array.isArray(raw.drafts)) fail("no drafts array");
  return raw.drafts.map((d: unknown, i: number) => {
    if (!isObject(d)) fail(`draft ${i} is not an object`);
    const str = (v: unknown) => (typeof v === "string" ? v : fail(`draft ${i} has a field that is not text`));
    const id = d.counterpartyId;
    const amount = d.amountCents;
    const found: Found = {
      counterpartyId: id !== speakerId && traders.some((t) => t.id === id) ? (id as TraderId) : null,
      counterpartyText: str(d.counterpartyText),
      direction: DIRECTIONS.find((x) => x === d.direction) ?? null,
      amountCents: typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0 ? amount : null,
      note: str(d.note),
      confidence: CONFIDENCE.find((c) => c === d.confidence) ?? "low",
      question: d.question == null ? undefined : str(d.question).trim() || undefined,
    };
    // Plain code asks only for a missing field. A question on a complete draft becomes low confidence.
    if (found.question && found.counterpartyId && found.direction && found.amountCents !== null) {
      found.question = undefined;
      found.confidence = "low";
    }
    return toDraft(found, traders, speakerId);
  });
}

// ---- Plain-code fallback ----

// "I owe Hery 50 for rice", "Hery owes me $120.50"
const DEBT_RE = /^(.+?)\s+owes?\s+(.+?)\s+\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:\$|usd|dollars?)?(?:\s+for\s+(.+))?$/i;

// ponytail: English sentence pattern only. Set AI_API_KEY for French, Malagasy, free text and photos.
export function fallbackCapture({ text, imageBase64, traders, speakerId }: CaptureInput): DebtDraft[] {
  if (!text?.trim()) return imageBase64 ? [emptyDraft("Reading a photo needs an AI key. Type the debt instead.")] : [];
  return text.split(/[;\n!?]+|\.(?!\d)/).flatMap((sentence) => {
    const clean = sentence.trim().replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/(\d),(\d{1,2})(?!\d)/g, "$1.$2");
    const m = DEBT_RE.exec(clean);
    if (!m) return [];
    const [debtor, creditor] = [m[1].trim(), m[2].trim()];
    const [debtorId, creditorId] = [matchTrader(debtor, traders, speakerId), matchTrader(creditor, traders, speakerId)];
    const cents = Math.round(Number(m[3]) * 100);
    const base = { amountCents: cents > 0 ? cents : null, note: m[4]?.trim() ?? "", confidence: "medium" as const };
    const other = (id: TraderId | null) => (id === speakerId ? null : id);
    const found: Found =
      debtorId === speakerId
        ? { ...base, counterpartyId: other(creditorId), counterpartyText: creditor, direction: "you_owe" }
        : creditorId === speakerId
          ? { ...base, counterpartyId: debtorId, counterpartyText: debtor, direction: "owed_to_you" }
          : {
              ...base,
              counterpartyId: null,
              counterpartyText: "",
              direction: null,
              confidence: "low",
              question: `This debt is between ${debtor} and ${creditor}. Add only your own debts.`,
            };
    return [toDraft(found, traders, speakerId)];
  });
}

// ---- Entry point ----

function systemPrompt(traders: Trader[], speakerId: TraderId): string {
  const speaker = traders.find((t) => t.id === speakerId)?.name ?? speakerId;
  return [
    "You read debts between traders in one market in Madagascar. The input is in English, French or Malagasy. It is typed text or a photo of a notebook page.",
    `The person who speaks is ${speaker} (id ${speakerId}). Words such as "I", "me", "je", "moi", "aho", "izaho", "za" and "ahy" mean this person.`,
    `The notebook belongs to ${speaker}. Every debt on it is between ${speaker} and ONE other trader. Never return a debt between two other people. Never return ${speaker} as the counterparty.`,
    "Traders (id: name, business, other names):",
    ...traders.map((t) => `- ${t.id}: ${t.name}, ${t.business}, ${t.aliases.join(", ") || "no other names"}`),
    `counterpartyId is the id of the other trader. Match the name or one of the other names to exactly one trader. Use only the ids in this list, and never ${speakerId}. counterpartyText is the other trader's name as written.`,
    `direction is from the side of ${speaker}: "you_owe" means ${speaker} owes the counterparty. "owed_to_you" means the counterparty owes ${speaker}.`,
    'Malagasy hints: "ananan\'i X aho", "ananan\'i X za" and "ananan\'i X izaho" mean "I owe X". "manana trosa amin\'i X aho" means "I owe X". "mitrosa amiko i X" and "ananako i X" mean "X owes me". "nindrana tamin\'i X aho" means "I borrowed from X", so I owe X.',
    "When a line does not say the direction, find it in this order. First, the goods: the trader whose business sells the goods on the line is the one who is owed (a restaurant that notes meat next to the butcher owes the butcher; a rice seller who notes bags next to a name is owed by that person). Second, the line above it, or the page heading: a line with only a name and an amount takes that direction. In both cases confidence is medium or low, never high.",
    "If nothing on the page gives the direction, set direction to null and write a question that asks which way the debt goes.",
    `If a line names only ${speaker}, or a person who is not in the trader list, set counterpartyId to null, set counterpartyText to the name as written, and write a question that asks who the other trader is.`,
    "All amounts are US dollars. amountCents is the dollar amount times 100: 300 means 30000, 12.50 means 1250. Take the amount as written. If the amount is not clear, set amountCents to null and write a short question. Never guess an amount.",
    "Skip totals and headings. Return one draft for each debt line. note says in a few English words what the debt is for.",
    "confidence is high when the name, the direction and the amount are clear, medium when you had to interpret, low when you are not sure.",
    "question is null when you filled counterpartyId, direction and amountCents. Put a doubt about a filled field in confidence, not in question. When a field is null, question is one short hint about it.",
  ].join("\n");
}

export async function captureDebts(input: CaptureInput): Promise<{ drafts: DebtDraft[]; engine: "model" | "fallback" }> {
  const orAsk = (drafts: DebtDraft[]) =>
    drafts.length ? drafts : [emptyDraft("I could not find a debt. Write it like: Soa owes Hery 300 for rice.")];
  if (aiMode() === "model") {
    try {
      const { text, imageBase64, mediaType = "image/jpeg", traders, speakerId } = input;
      const raw = await askJson(
        systemPrompt(traders, speakerId),
        [
          ...(imageBase64 ? [{ type: "image_url" as const, image_url: { url: `data:${mediaType};base64,${imageBase64}` } }] : []),
          { type: "text", text: text ? `Read the debts in this text:\n<text>\n${text}\n</text>` : "Read the debts on this notebook page." },
        ],
        "debt_drafts",
        SCHEMA,
      );
      return { drafts: orAsk(validateDrafts(raw, traders, speakerId)), engine: "model" };
    } catch (e) {
      console.error("captureDebts: model call failed, using the fallback.", e);
    }
  }
  return { drafts: orAsk(fallbackCapture(input)), engine: "fallback" };
}
