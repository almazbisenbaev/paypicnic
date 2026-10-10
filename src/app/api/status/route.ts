import { readPaymentLink } from "@/lib/payment-links";
import { devnetConnection, getPaymentStatus } from "@/lib/solana";
import { z } from "zod";
import { apiError, json, readJson, tokenBody } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { token, lastValidBlockHeight } = tokenBody
      .extend({ lastValidBlockHeight: z.number().int().positive().optional() })
      .parse(await readJson(request));
    // Check finalized expiry BEFORE checking receipts. An unknown wallet result
    // must not expose a retry while its previous transaction can still land.
    const canRetry = lastValidBlockHeight
      ? (await (await devnetConnection()).getBlockHeight("finalized")) >
        lastValidBlockHeight
      : false;
    return json({
      ...(await getPaymentStatus(readPaymentLink(token))),
      canRetry,
    });
  } catch (error) {
    return apiError(error);
  }
}
