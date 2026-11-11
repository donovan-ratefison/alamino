import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({
    paypalMode: process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? "sandbox" : "simulated",
    aiMode: process.env.AI_API_KEY ? "model" : "fallback",
  });
}
