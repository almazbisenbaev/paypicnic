import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { ACCOUNT_SIZE, getAccount, getMint } from "@solana/spl-token";
import bs58 from "bs58";
import { DEVNET_GENESIS, USDC_MINT } from "./config";
import { AppError } from "./errors";
import { buildPaymentTransaction, paymentAccounts } from "./transaction";
import { paymentMemo } from "./payment-links";
import { verifyPaymentTransaction } from "./verify";
import { formatUnits, parseAmount } from "./money";
import type {
  PaymentRequest,
  PaymentStatus,
  PreparedPayment,
  Receipt,
} from "./types";

let connection: Connection | undefined;
let checkedAt = 0;

export async function devnetConnection(): Promise<Connection> {
  connection ??= new Connection(
    process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    {
      commitment: "confirmed",
      disableRetryOnRateLimit: true,
      fetch: (url, init) =>
        fetch(url, {
          ...init,
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        }),
    },
  );
  if (Date.now() - checkedAt > 60_000) {
    if ((await connection.getGenesisHash()) !== DEVNET_GENESIS)
      throw new AppError(
        "The RPC is not connected to Solana devnet. Payments are disabled.",
        503,
      );
    checkedAt = Date.now();
  }
  return connection;
}

export async function getReceipt(
  request: PaymentRequest,
  signature: string,
): Promise<Receipt | null> {
  try {
    if (bs58.decode(signature).length !== 64) throw new Error();
  } catch {
    throw new AppError("Enter a valid Solana transaction signature.");
  }
  const rpc = await devnetConnection();
  const transaction = await rpc.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!transaction) return null;
  return verifyPaymentTransaction(request, signature, transaction);
}

export async function getPaymentStatus(
  request: PaymentRequest,
): Promise<PaymentStatus> {
  const rpc = await devnetConnection();
  const signatures = await rpc.getSignaturesForAddress(
    new PublicKey(request.reference),
    { limit: 100 },
    "confirmed",
  );
  for (const entry of signatures) {
    if (entry.err || !entry.memo?.includes(paymentMemo(request))) continue;
    try {
      const receipt = await getReceipt(request, entry.signature);
      if (receipt) return { status: "paid", receipt };
      // A known signature with unavailable transaction data is not proof of nonpayment.
      throw new AppError(
        "Solana is still indexing this payment. Check again shortly.",
        503,
      );
    } catch (error) {
      if (!(error instanceof AppError) || error.status >= 500) throw error;
      // Ignore a transaction carrying this public reference but not the agreed payment.
    }
  }
  if (signatures.length === 100)
    throw new AppError(
      "This link has too much on-chain activity to safely determine its status. Contact the creator.",
      503,
    );
  return { status: "unpaid" };
}

export async function preparePayment(
  request: PaymentRequest,
  payer: PublicKey,
): Promise<PreparedPayment> {
  const accounts = paymentAccounts(request, payer);
  const rpc = await devnetConnection();
  const status = await getPaymentStatus(request);
  if (status.status === "paid")
    throw new AppError(
      "This payment link has already been paid. Refresh to view its receipt.",
      409,
    );
  const [mint, sourceInfo, solBalance, destinationInfo, block, recipientInfo] =
    await Promise.all([
      getMint(rpc, new PublicKey(USDC_MINT)),
      rpc.getAccountInfo(accounts.source),
      rpc.getBalance(payer),
      rpc.getMultipleAccountsInfo(accounts.destinations),
      rpc.getLatestBlockhash("confirmed"),
      rpc.getMultipleAccountsInfo(accounts.recipients),
    ]);
  if (
    recipientInfo.some(
      (account) =>
        account &&
        (account.executable ||
          !account.owner.equals(SystemProgram.programId) ||
          account.data.length !== 0),
    )
  ) {
    throw new AppError(
      "A recipient address belongs to a token account or program. Ask for the recipient's wallet address and create a new link.",
    );
  }
  if (mint.decimals !== 6)
    throw new AppError(
      "The configured test token has unexpected decimals.",
      503,
    );
  if (!sourceInfo)
    throw new AppError(
      "This wallet has no test USDC account. Get test USDC from the Circle faucet below.",
    );
  const source = await getAccount(rpc, accounts.source);
  if (source.amount < parseAmount(request.amount))
    throw new AppError(
      `Not enough test USDC. This wallet has ${formatUnits(source.amount)}; the payment needs ${request.amount}.`,
    );
  if (source.isFrozen)
    throw new AppError("This wallet's test USDC account is frozen.");
  const transaction = buildPaymentTransaction(request, payer, block.blockhash);
  const [fee, rent] = await Promise.all([
    rpc.getFeeForMessage(transaction.compileMessage(), "confirmed"),
    rpc.getMinimumBalanceForRentExemption(ACCOUNT_SIZE),
  ]);
  if (fee.value === null)
    throw new AppError(
      "Could not estimate the network fee. Please try again.",
      503,
    );
  const rentLamports = destinationInfo.filter((a) => !a).length * rent;
  if (solBalance < fee.value + rentLamports)
    throw new AppError(
      `Add devnet SOL for fees and recipient token accounts (about ${(Number(fee.value) + rentLamports) / 1e9} SOL). Use the SOL faucet below.`,
    );
  const simulation = await rpc.simulateTransaction(transaction);
  if (simulation.value.err)
    throw new AppError(
      "Solana could not simulate this payment. Check the recipient wallets and token accounts, then try again.",
    );
  return {
    transaction: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    ...block,
    feeLamports: fee.value,
    rentLamports,
  };
}
