import { connection } from "next/server";
import { listTraders } from "@/lib/db";

export async function GET() {
  await connection();
  return Response.json(listTraders());
}
