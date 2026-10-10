import { PublicKey, type VersionedTransactionResponse } from "@solana/web3.js";
import { buildPaymentTransaction, paymentAccounts } from "./transaction";
import { AppError } from "./errors";
import { USDC_MINT } from "./config";
import type { PaymentRequest, Receipt } from "./types";

// Verify the entire message, not merely a signature or a memo. This excludes extra
// instructions that could transfer the funds back out or bind an unrelated payment.
export function verifyPaymentTransaction(
  request: PaymentRequest,
  signature: string,
  response: VersionedTransactionResponse,
): Receipt {
  if (!response.meta || response.meta.err !== null)
    throw new AppError(
      "This transaction failed. No payment receipt was issued.",
    );
  if (response.transaction.signatures[0] !== signature)
    throw new AppError("The transaction signature does not match.");
  const message = response.transaction.message;
  if (message.version !== "legacy")
    throw new AppError("This is not a supported Paypicnic transaction.");
  const payer = message.staticAccountKeys[0];
  if (!payer || message.header.numRequiredSignatures !== 1)
    throw new AppError("The paying wallet is missing.");
  const expected = buildPaymentTransaction(
    request,
    payer,
    message.recentBlockhash,
  ).compileMessage();
  if (
    !Buffer.from(message.serialize()).equals(Buffer.from(expected.serialize()))
  )
    throw new AppError(
      "This transaction does not match this payment link's recipients, amounts, and reference.",
    );

  const { destinations, amounts } = paymentAccounts(request, payer);
  for (let i = 0; i < 2; i++) {
    const accountIndex = message.staticAccountKeys.findIndex((k: PublicKey) =>
      k.equals(destinations[i]),
    );
    const before = response.meta.preTokenBalances?.find(
      (b) => b.accountIndex === accountIndex,
    );
    const after = response.meta.postTokenBalances?.find(
      (b) => b.accountIndex === accountIndex,
    );
    if (
      !after ||
      after.mint !== USDC_MINT ||
      after.owner !== request.recipients[i].wallet ||
      BigInt(after.uiTokenAmount.amount) -
        BigInt(before?.uiTokenAmount.amount ?? "0") !==
        amounts[i]
    ) {
      throw new AppError(
        "The recipient balance changes do not match the agreed split.",
      );
    }
  }
  return {
    signature,
    payer: payer.toBase58(),
    slot: response.slot,
    timestamp: response.blockTime ?? null,
    amounts: [amounts[0].toString(), amounts[1].toString()],
    feeLamports: response.meta.fee,
  };
}
