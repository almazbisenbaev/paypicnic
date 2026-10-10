import { PublicKey } from "@solana/web3.js";
import { readPaymentLink } from "@/lib/payment-links";
import { preparePayment } from "@/lib/solana";
import { apiError, json, readJson, tokenBody } from "@/lib/http";
import { walletSchema } from "@/lib/validation";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = tokenBody
      .extend({ payer: walletSchema })
      .parse(await readJson(request));
    return json(
      await preparePayment(
        readPaymentLink(body.token),
        new PublicKey(body.payer),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
