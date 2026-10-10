import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { DECIMALS, MEMO_PROGRAM, USDC_MINT } from "./config";
import { parseAmount, splitAmount } from "./money";
import { paymentMemo } from "./payment-links";
import { AppError } from "./errors";
import type { PaymentRequest } from "./types";

export function paymentAccounts(request: PaymentRequest, payer: PublicKey) {
  const mint = new PublicKey(USDC_MINT);
  const recipients = request.recipients.map((r) => new PublicKey(r.wallet));
  if (recipients.some((r) => r.equals(payer)))
    throw new AppError(
      "Use a separate client wallet to pay. The paying wallet cannot also be a recipient.",
    );
  return {
    mint,
    source: getAssociatedTokenAddressSync(mint, payer),
    recipients,
    destinations: recipients.map((r) => getAssociatedTokenAddressSync(mint, r)),
    amounts: splitAmount(parseAmount(request.amount), request.firstPercent),
  };
}

export function buildPaymentTransaction(
  request: PaymentRequest,
  payer: PublicKey,
  blockhash: string,
): Transaction {
  const { mint, source, recipients, destinations, amounts } = paymentAccounts(
    request,
    payer,
  );
  const transaction = new Transaction({
    feePayer: payer,
    recentBlockhash: blockhash,
  });
  for (let index = 0; index < 2; index++) {
    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        destinations[index],
        recipients[index],
        mint,
      ),
    );
  }
  for (let index = 0; index < 2; index++) {
    const transfer = createTransferCheckedInstruction(
      source,
      mint,
      destinations[index],
      payer,
      amounts[index],
      DECIMALS,
    );
    // Solana Pay-style reference: an extra read-only account on the token transfer.
    transfer.keys.push({
      pubkey: new PublicKey(request.reference),
      isSigner: false,
      isWritable: false,
    });
    transaction.add(transfer);
  }
  transaction.add(
    new TransactionInstruction({
      programId: new PublicKey(MEMO_PROGRAM),
      keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
      data: Buffer.from(paymentMemo(request)),
    }),
  );
  return transaction;
}
