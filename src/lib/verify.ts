import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
  TransactionMessage,
  type VersionedTransactionResponse,
} from "@solana/web3.js";
import { buildPaymentTransaction, paymentAccounts } from "./transaction";
import { AppError } from "./errors";
import { USDC_MINT } from "./config";
import type { PaymentRequest, Receipt } from "./types";

// Wallets may add compute-unit limit/price settings before signing. Remove only
// those account-free settings, then require the entire payment message to match.
// Extra transfers, changed recipients, amounts, references and memos still fail.
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
  const feeSettings = new Set<number>();
  const instructions = TransactionMessage.decompile(message).instructions.filter(
    (instruction) => {
      if (!instruction.programId.equals(ComputeBudgetProgram.programId))
        return true;
      const kind = instruction.data[0];
      const validSetting =
        (kind === 2 && instruction.data.length === 5) ||
        (kind === 3 && instruction.data.length === 9);
      if (!validSetting || instruction.keys.length || feeSettings.has(kind))
        throw new AppError(
          "This transaction contains unsupported wallet fee settings.",
        );
      feeSettings.add(kind);
      return false;
    },
  );
  if (
    instructions.length !== expected.instructions.length ||
    !new Transaction({ feePayer: payer, recentBlockhash: message.recentBlockhash })
      .add(...instructions)
      .compileMessage()
      .serialize()
      .equals(expected.serialize())
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
