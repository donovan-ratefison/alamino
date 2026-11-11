import { listTraders } from "@/lib/db";
import { captureDebts, IMAGE_TYPES, type ImageType } from "@/lib/ai/capture";

const MAX_TEXT = 2000;
const MAX_IMAGE_BASE64 = 5 * 1024 * 1024;

const bad = (error: string) => Response.json({ error }, { status: 400 });

// Reads text or a photo into draft debts. Nothing is saved.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return bad("The body must be a JSON object.");
  const { text, imageBase64, mediaType = "image/jpeg", createdBy } = body;

  const traders = listTraders();
  if (typeof createdBy !== "string" || !traders.some((t) => t.id === createdBy)) return bad("createdBy must be a known trader id.");
  if (text !== undefined && typeof text !== "string") return bad("text must be a string.");
  if (typeof text === "string" && text.length > MAX_TEXT) return bad(`text must be ${MAX_TEXT} characters or fewer.`);
  if (imageBase64 !== undefined) {
    if (typeof imageBase64 !== "string") return bad("imageBase64 must be a string.");
    if (imageBase64.length > MAX_IMAGE_BASE64) return bad("The image must be 5 MB or smaller.");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) return bad("imageBase64 must be raw base64 with no data URL prefix.");
  }
  if (!IMAGE_TYPES.includes(mediaType as ImageType)) return bad(`mediaType must be one of ${IMAGE_TYPES.join(", ")}.`);
  if (!(typeof text === "string" && text.trim()) && !imageBase64) return bad("Give a text or an image.");

  return Response.json(
    await captureDebts({
      text: typeof text === "string" && text.trim() ? text : undefined,
      imageBase64: imageBase64 as string | undefined,
      mediaType: mediaType as ImageType,
      traders,
      speakerId: createdBy,
    }),
  );
}
