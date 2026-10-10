import { z } from "zod";
import { readPaymentLink } from "@/lib/payment-links";
import { getReceipt } from "@/lib/solana";
import { apiError, json, readJson, tokenBody } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = tokenBody
      .extend({
        signature: z
          .string()
          .min(
            64,
            "Paste the full Solana transaction signature from your wallet.",
          )
          .max(90, "Paste a valid Solana transaction signature."),
      })
      .parse(await readJson(request));
    const receipt = await getReceipt(
      readPaymentLink(body.token),
      body.signature,
    );
    return json(
      receipt ? { status: "paid", receipt } : { status: "pending" },
      receipt ? 200 : 202,
    );
  } catch (error) {
    return apiError(error);
  }
}
