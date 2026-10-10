import { createPaymentLink } from "@/lib/payment-links";
import { apiError, json, readJson } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    return json(createPaymentLink(await readJson(request)), 201);
  } catch (error) {
    return apiError(error);
  }
}
