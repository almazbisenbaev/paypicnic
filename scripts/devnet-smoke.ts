import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  devnetConnection,
  getReceipt,
  preparePayment,
} from "../src/lib/solana";
import { createPaymentLink } from "../src/lib/payment-links";
import { USDC_MINT, explorerTransaction } from "../src/lib/config";
import { formatUnits } from "../src/lib/money";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  mkdirSync(".local", { recursive: true, mode: 0o700 });
  const keyFile = ".local/devnet-wallets.json";
  if (!existsSync(keyFile)) {
    const keys = Array.from({ length: 3 }, () =>
      Array.from(Keypair.generate().secretKey),
    );
    writeFileSync(keyFile, JSON.stringify(keys), { mode: 0o600 });
    console.log(
      "Created three disposable DEVNET-ONLY test wallets in .local/devnet-wallets.json.",
    );
  }
  const [payer, developer, designer] = (
    JSON.parse(readFileSync(keyFile, "utf8")) as number[][]
  ).map((key) => Keypair.fromSecretKey(Uint8Array.from(key)));
  console.log(
    JSON.stringify(
      {
        payer: payer.publicKey.toBase58(),
        developer: developer.publicKey.toBase58(),
        designer: designer.publicKey.toBase58(),
      },
      null,
      2,
    ),
  );
  const rpc = await devnetConnection(); // Genesis check hard-blocks all other networks.
  if (existsSync(".local/devnet-result.json")) {
    const previous = JSON.parse(
      readFileSync(".local/devnet-result.json", "utf8"),
    );
    const receipt = await getReceipt(previous.request, previous.signature);
    console.log(
      receipt
        ? "Previous payment verified; not sending again."
        : "A previous payment is pending; not sending again.",
    );
    console.log(explorerTransaction(previous.signature));
    console.log(
      `Receipt: http://127.0.0.1:3000/pay/${previous.token}?tx=${previous.signature}`,
    );
    return;
  }
  let lamports = await rpc.getBalance(payer.publicKey);
  if (process.argv.includes("--airdrop") && lamports < 10_000_000) {
    const signature = await rpc.requestAirdrop(payer.publicKey, 100_000_000);
    console.log("Devnet SOL airdrop requested:", signature);
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      lamports = await rpc.getBalance(payer.publicKey);
      if (lamports >= 10_000_000) break;
    }
  }
  const ata = getAssociatedTokenAddressSync(
    new PublicKey(USDC_MINT),
    payer.publicKey,
  );
  let balance = 0n;
  if (await rpc.getAccountInfo(ata))
    balance = (await getAccount(rpc, ata)).amount;
  console.log(
    `Balances: ${lamports / 1e9} devnet SOL, ${formatUnits(balance)} test USDC.`,
  );
  if (!process.argv.includes("--send")) {
    console.log(
      "Fund this disposable payer using https://faucet.solana.com and https://faucet.circle.com (Solana Devnet). Then run npm run smoke:devnet -- --send.",
    );
    return;
  }
  const { token, request } = createPaymentLink({
    title: "Paypicnic devnet smoke test",
    note: "A real devnet transaction with test tokens.",
    amount: "10",
    firstPercent: 70,
    recipients: [
      { name: "Developer", wallet: developer.publicKey.toBase58() },
      { name: "Designer", wallet: designer.publicKey.toBase58() },
    ],
  });
  const prepared = await preparePayment(request, payer.publicKey);
  const transaction = Transaction.from(
    Buffer.from(prepared.transaction, "base64"),
  );
  transaction.sign(payer);
  const signature = await rpc.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 3,
  });
  writeFileSync(
    ".local/devnet-result.json",
    JSON.stringify(
      {
        token,
        signature,
        request,
        prepared: {
          blockhash: prepared.blockhash,
          lastValidBlockHeight: prepared.lastValidBlockHeight,
        },
      },
      null,
      2,
    ),
  );
  console.log("Sent:", explorerTransaction(signature));
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const receipt = await getReceipt(request, signature);
    if (receipt) {
      console.log("Verified both transfers:", JSON.stringify(receipt, null, 2));
      console.log(
        `Receipt: http://127.0.0.1:3000/pay/${token}?tx=${signature}`,
      );
      return;
    }
  }
  throw new Error(
    "Transaction sent, still unconfirmed. Check .local/devnet-result.json and the explorer before attempting another payment.",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Devnet smoke test failed.",
  );
  process.exitCode = 1;
});
