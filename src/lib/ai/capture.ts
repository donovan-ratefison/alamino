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
        required: ["debtorId", "creditorId", "debtorText", "creditorText", "amountCents", "note", "confidence", "question"],
        properties: {
          debtorId: nullable("string"),
          creditorId: nullable("string"),
          debtorText: { type: "string" },
          creditorText: { type: "string" },
          amountCents: nullable("integer"),
          note: { type: "string" },
          confidence: { type: "string", enum: CONFIDENCE },
          question: nullable("string"),
        },
      },
    },
  },
};

function emptyDraft(question: string): DebtDraft {
  return { debtorId: null, creditorId: null, debtorText: "", creditorText: "", amountCents: null, note: "", confidence: "low", question };
}

// Adds a question when the draft cannot be saved as it is.
function withQuestion(d: DebtDraft): DebtDraft {
  if (d.question) return d;
  const question = !d.debtorId
    ? `Who is "${d.debtorText}"? Pick the trader who owes the money.`
    : !d.creditorId
      ? `Who is "${d.creditorText}"? Pick the trader who is owed the money.`
      : d.debtorId === d.creditorId
        ? "The debtor and the creditor are the same trader. Who is the other side?"
        : d.amountCents === null
          ? "What is the amount in US dollars?"
          : undefined;
  return question ? { ...d, question, confidence: "low" } : d;
}

function fail(message: string): never {
  throw new Error(`Invalid capture output: ${message}`);
}

// Checks the model output. Throws on any value the app cannot trust.
export function validateDrafts(raw: unknown, traders: Trader[]): DebtDraft[] {
  if (!isObject(raw) || !Array.isArray(raw.drafts)) fail("no drafts array");
  const ids = new Set(traders.map((t) => t.id));
  return raw.drafts.map((d: unknown, i: number) => {
    if (!isObject(d)) fail(`draft ${i} is not an object`);
    const id = (v: unknown) => (v === null ? null : typeof v === "string" && ids.has(v) ? v : fail(`draft ${i} has unknown trader id ${String(v)}`));
    const str = (v: unknown) => (typeof v === "string" ? v : fail(`draft ${i} has a field that is not text`));
    const amount = d.amountCents;
    if (amount !== null && !(typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0))
      fail(`draft ${i} amount ${String(amount)} is not a positive integer of cents`);
    const confidence = CONFIDENCE.find((c) => c === d.confidence) ?? fail(`draft ${i} has bad confidence`);
    const question = d.question == null ? undefined : str(d.question);
    return withQuestion({
      debtorId: id(d.debtorId),
      creditorId: id(d.creditorId),
      debtorText: str(d.debtorText),
      creditorText: str(d.creditorText),
      amountCents: amount as number | null,
      note: str(d.note),
      confidence,
      ...(question ? { question } : {}),
    });
  });
}

// ---- Plain-code fallback ----

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function matchTrader(text: string, traders: Trader[], speakerId: TraderId): TraderId | null {
  const t = norm(text);
  if (t === "i" || t === "me") return speakerId;
  const padded = ` ${t} `;
  const names = (tr: Trader) => [tr.name, ...tr.aliases].map(norm).filter(Boolean);
  return traders.find((tr) => names(tr).some((n) => padded.includes(` ${n} `)))?.id ?? null;
}

// "Soa owes Hery 300 for rice", "I owe Hery 50", "Hery owes me $120.50"
const DEBT_RE = /^(.+?)\s+owes?\s+(.+?)\s+\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:\$|usd|dollars?)?(?:\s+for\s+(.+))?$/i;

// ponytail: English sentence pattern only. Set AI_API_KEY for French, Malagasy, free text and photos.
export function fallbackCapture({ text, imageBase64, traders, speakerId }: CaptureInput): DebtDraft[] {
  if (!text?.trim()) return imageBase64 ? [emptyDraft("Reading a photo needs an AI key. Type the debt instead.")] : [];
  return text.split(/[;\n!?]+|\.(?!\d)/).flatMap((sentence) => {
    const clean = sentence.trim().replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/(\d),(\d{1,2})(?!\d)/g, "$1.$2");
    const m = DEBT_RE.exec(clean);
    if (!m) return [];
    const cents = Math.round(Number(m[3]) * 100);
    return [
      withQuestion({
        debtorId: matchTrader(m[1], traders, speakerId),
        creditorId: matchTrader(m[2], traders, speakerId),
        debtorText: m[1].trim(),
        creditorText: m[2].trim(),
        amountCents: cents > 0 ? cents : null,
        note: m[4]?.trim() ?? "",
        confidence: "medium",
      }),
    ];
  });
}

// ---- Entry point ----

function systemPrompt(traders: Trader[], speakerId: TraderId): string {
  const speaker = traders.find((t) => t.id === speakerId);
  return [
    "You read debts between traders in one market in Madagascar. The input is in English, French or Malagasy. It is typed text or a photo of a notebook page.",
    "Return one draft for each debt you find. The debtor owes money to the creditor.",
    `The person who speaks is ${speaker?.name ?? speakerId} (id ${speakerId}). Words such as "I", "me", "je", "moi", "aho", "izaho" and "ahy" mean this person.`,
    "Traders (id: name, business, other names):",
    ...traders.map((t) => `- ${t.id}: ${t.name}, ${t.business}, ${t.aliases.join(", ") || "no other names"}`),
    "Use only these ids. If a name does not match exactly one trader, set the id to null and write a short question.",
    "All amounts are US dollars. amountCents is the dollar amount times 100: 300 means 30000, 12.50 means 1250. If the amount is not clear, set amountCents to null and write a short question. Never guess an amount.",
    "debtorText and creditorText are the names as written. note says in a few English words what the debt is for.",
    "confidence is high when names and amount are clear, medium when you had to interpret, low when you are not sure. question is null when nothing is unclear.",
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
      return { drafts: orAsk(validateDrafts(raw, traders)), engine: "model" };
    } catch (e) {
      console.error("captureDebts: model call failed, using the fallback.", e);
    }
  }
  return { drafts: orAsk(fallbackCapture(input)), engine: "fallback" };
}
