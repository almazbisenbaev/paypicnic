import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type VersionedTransactionResponse,
} from "@solana/web3.js";
import { LiteSVM, FailedTransactionMetadata } from "litesvm";
import {
  AccountLayout,
  MintLayout,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import { parseAmount, splitAmount, formatUnits } from "../src/lib/money";
import { createPaymentLink, readPaymentLink } from "../src/lib/payment-links";
import { requestInputSchema } from "../src/lib/validation";
import {
  buildPaymentTransaction,
  paymentAccounts,
} from "../src/lib/transaction";
import { verifyPaymentTransaction } from "../src/lib/verify";
import { USDC_MINT } from "../src/lib/config";
import { readJson } from "../src/lib/http";

process.env.PAYMENT_LINK_SECRET =
  "test-only-secret-which-is-not-used-by-the-application";
const first = Keypair.generate().publicKey.toBase58();
const second = Keypair.generate().publicKey.toBase58();
const input = {
  title: "Website project",
  note: "Thanks!",
  amount: "10",
  firstPercent: 70,
  recipients: [
    { name: "Developer", wallet: first },
    { name: "Designer", wallet: second },
  ],
};

test("70/30 split uses integer base units and conserves every unit", () => {
  assert.deepEqual(splitAmount(parseAmount("500"), 70), [
    350_000_000n,
    150_000_000n,
  ]);
  assert.deepEqual(splitAmount(parseAmount("0.000003"), 50), [1n, 2n]);
  for (let p = 1; p < 100; p++) {
    const [a, b] = splitAmount(parseAmount("123.456789"), p);
    assert.equal(a + b, 123456789n);
    assert.ok(a > 0n && b > 0n);
  }
  assert.equal(formatUnits(parseAmount("1000000")), "1,000,000.00");
});

test("invalid amounts and splits cannot produce a payment", () => {
  for (const amount of [
    "0",
    "-1",
    "NaN",
    "Infinity",
    "1e3",
    "01",
    "1.0000001",
    "1000001",
    "1,000",
    "",
    " ",
  ])
    assert.throws(() => parseAmount(amount));
  for (const percent of [0, 100, 3.5, NaN])
    assert.throws(() => splitAmount(1000000n, percent));
  assert.throws(() => splitAmount(1n, 50));
});

test("recipient validation rejects duplicates, off-curve keys, and malformed addresses", () => {
  assert.equal(requestInputSchema.safeParse(input).success, true);
  assert.equal(
    requestInputSchema.safeParse({
      ...input,
      recipients: [input.recipients[0], input.recipients[0]],
    }).success,
    false,
  );
  const tokenAccount = getAssociatedTokenAddressSync(
    new PublicKey(USDC_MINT),
    new PublicKey(first),
  );
  for (const wallet of [
    "not-a-wallet",
    tokenAccount.toBase58(),
    PublicKey.default.toBase58(),
  ])
    assert.equal(
      requestInputSchema.safeParse({
        ...input,
        recipients: [{ ...input.recipients[0], wallet }, input.recipients[1]],
      }).success,
      false,
    );
});

test("signed links round-trip, bind all details, and reject tampering", () => {
  const { token, request } = createPaymentLink(input);
  assert.deepEqual(readPaymentLink(token), request);
  assert.equal(
    JSON.stringify(readPaymentLink(token)),
    JSON.stringify(request),
    "Memo serialization must stay stable after reading a link",
  );
  const [payload, signature] = token.split(".");
  const changed = JSON.parse(Buffer.from(payload, "base64url").toString());
  changed.recipients[0].wallet = Keypair.generate().publicKey.toBase58();
  assert.throws(
    () =>
      readPaymentLink(
        `${Buffer.from(JSON.stringify(changed)).toString("base64url")}.${signature}`,
      ),
    /changed/,
  );
  assert.throws(() => readPaymentLink(token.slice(0, -3)), /invalid/);
  assert.throws(() => readPaymentLink("a".repeat(5000)), /invalid/);
  assert.notEqual(
    createPaymentLink(input).request.reference,
    request.reference,
  );
});

function fixture(balance = 100_000_000n, frozenSecond = false) {
  const svm = new LiteSVM();
  const payer = Keypair.generate();
  svm.airdrop(payer.publicKey, 1_000_000_000n);
  const { request } = createPaymentLink(input);
  const mint = new PublicKey(USDC_MINT);
  const mintData = Buffer.alloc(MintLayout.span);
  MintLayout.encode(
    {
      mintAuthorityOption: 1,
      mintAuthority: payer.publicKey,
      supply: balance,
      decimals: 6,
      isInitialized: true,
      freezeAuthorityOption: 1,
      freezeAuthority: payer.publicKey,
    },
    mintData,
  );
  svm.setAccount(mint, {
    owner: TOKEN_PROGRAM_ID,
    data: mintData,
    executable: false,
    lamports: Number(
      svm.minimumBalanceForRentExemption(BigInt(mintData.length)),
    ),
  });
  const accounts = paymentAccounts(request, payer.publicKey);
  function setToken(
    address: PublicKey,
    owner: PublicKey,
    amount: bigint,
    frozen = false,
  ) {
    const data = Buffer.alloc(AccountLayout.span);
    AccountLayout.encode(
      {
        mint,
        owner,
        amount,
        delegateOption: 0,
        delegate: PublicKey.default,
        state: frozen ? 2 : 1,
        isNativeOption: 0,
        isNative: 0n,
        delegatedAmount: 0n,
        closeAuthorityOption: 0,
        closeAuthority: PublicKey.default,
      },
      data,
    );
    svm.setAccount(address, {
      data,
      owner: TOKEN_PROGRAM_ID,
      executable: false,
      lamports: Number(svm.minimumBalanceForRentExemption(BigInt(data.length))),
    });
  }
  setToken(accounts.source, payer.publicKey, balance);
  if (frozenSecond)
    setToken(accounts.destinations[1], accounts.recipients[1], 0n, true);
  const transaction = buildPaymentTransaction(
    request,
    payer.publicKey,
    svm.latestBlockhash(),
  );
  transaction.sign(payer);
  function amountAt(address: PublicKey): bigint {
    const account = svm.getAccount(address);
    return account
      ? AccountLayout.decode(Buffer.from(account.data)).amount
      : 0n;
  }
  return { svm, payer, request, transaction, accounts, amountAt };
}

test("real SPL programs execute both transfers and create recipient accounts in one transaction", () => {
  const { svm, transaction, accounts, amountAt } = fixture();
  assert.ok(
    transaction.serialize().length < 1232,
    "Transaction must fit Solana's packet limit",
  );
  const result = svm.sendTransaction(transaction);
  assert.ok(!(result instanceof FailedTransactionMetadata), result.toString());
  assert.equal(amountAt(accounts.destinations[0]), 7_000_000n);
  assert.equal(amountAt(accounts.destinations[1]), 3_000_000n);
  assert.equal(amountAt(accounts.source), 90_000_000n);
  assert.ok(result.logs().some((line) => line.includes("splitkit:v1:")));
});

test("failure of second transfer rolls back first transfer and recipient account creation", () => {
  const { svm, transaction, accounts, amountAt } = fixture(8_000_000n);
  const result = svm.sendTransaction(transaction);
  assert.ok(result instanceof FailedTransactionMetadata);
  assert.equal(amountAt(accounts.source), 8_000_000n);
  assert.equal(svm.getAccount(accounts.destinations[0]), null);
  assert.equal(svm.getAccount(accounts.destinations[1]), null);
});

test("frozen recipient also rolls back the other recipient's transfer", () => {
  const { svm, transaction, accounts, amountAt } = fixture(100_000_000n, true);
  assert.ok(
    svm.sendTransaction(transaction) instanceof FailedTransactionMetadata,
  );
  assert.equal(amountAt(accounts.source), 100_000_000n);
  assert.equal(svm.getAccount(accounts.destinations[0]), null);
  assert.equal(amountAt(accounts.destinations[1]), 0n);
});

function checkExecutedReceipt(walletFees: boolean) {
  const { svm, transaction, accounts, amountAt, request, payer } = fixture();
  if (walletFees) {
    transaction.instructions.unshift(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 375_000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    );
    transaction.sign(payer);
  }
  assert.ok(
    !(svm.sendTransaction(transaction) instanceof FailedTransactionMetadata),
  );
  const signature = bs58.encode(transaction.signature!);
  const message = transaction.compileMessage();
  const response: VersionedTransactionResponse = {
    slot: 5,
    blockTime: 1_790_000_000,
    transaction: { message, signatures: [signature] },
    meta: {
      err: null,
      fee: 5000,
      preBalances: [],
      postBalances: [],
      preTokenBalances: [],
      postTokenBalances: accounts.destinations.map((address, i) => ({
        accountIndex: message.accountKeys.findIndex((k) => k.equals(address)),
        mint: USDC_MINT,
        owner: request.recipients[i].wallet,
        uiTokenAmount: {
          amount: amountAt(address).toString(),
          decimals: 6,
          uiAmount: null,
        },
      })),
    },
  };
  const receipt = verifyPaymentTransaction(request, signature, response);
  assert.deepEqual(receipt.amounts, ["7000000", "3000000"]);
  assert.equal(receipt.payer, payer.publicKey.toBase58());
  // Even with valid balance changes, an unrelated transfer or altered payment
  // instruction must never qualify as this link's receipt.
  const paymentInstructions = transaction.instructions.filter(
    (instruction) => !instruction.programId.equals(ComputeBudgetProgram.programId),
  );
  const alteredTransfer = new TransactionInstruction({
    ...paymentInstructions[2],
    data: Buffer.from(paymentInstructions[2].data),
  });
  alteredTransfer.data[1] ^= 1;
  const alteredReference = new TransactionInstruction({
    ...paymentInstructions[2],
    keys: paymentInstructions[2].keys.map((key, index) =>
      index === 4 ? { ...key, pubkey: Keypair.generate().publicKey } : key,
    ),
  });
  const badFeeAccounts = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 1,
  });
  badFeeAccounts.keys.push({
    pubkey: payer.publicKey,
    isSigner: true,
    isWritable: true,
  });
  for (const instructions of [
    [
      ...transaction.instructions,
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      }),
    ],
    paymentInstructions.map((instruction, i) =>
      i === 2 ? alteredTransfer : instruction,
    ),
    paymentInstructions.map((instruction, i) =>
      i === 2 ? alteredReference : instruction,
    ),
    paymentInstructions.filter((_, i) => i !== 4),
    [...paymentInstructions, badFeeAccounts],
    [
      ...paymentInstructions,
      ComputeBudgetProgram.requestHeapFrame({ bytes: 32_768 }),
    ],
  ]) {
    const changed = new Transaction({
      feePayer: payer.publicKey,
      recentBlockhash: transaction.recentBlockhash,
    }).add(...instructions);
    changed.sign(payer);
    const changedSignature = bs58.encode(changed.signature!);
    assert.throws(
      () =>
        verifyPaymentTransaction(request, changedSignature, {
          ...response,
          transaction: {
            message: changed.compileMessage(),
            signatures: [changedSignature],
          },
        }),
      /does not match|unsupported wallet fee/,
    );
  }
  assert.throws(
    () =>
      verifyPaymentTransaction(
        createPaymentLink(input).request,
        signature,
        response,
      ),
    /does not match/,
  );
  assert.throws(
    () =>
      verifyPaymentTransaction(
        { ...request, amount: "9" },
        signature,
        response,
      ),
    /does not match/,
  );
  assert.throws(
    () =>
      verifyPaymentTransaction(request, signature, {
        ...response,
        meta: {
          ...response.meta!,
          err: { InstructionError: [3, "InsufficientFunds"] },
        },
      }),
    /failed/,
  );
  assert.throws(
    () =>
      verifyPaymentTransaction(request, signature, {
        ...response,
        meta: { ...response.meta!, postTokenBalances: [] },
      }),
    /balance changes/,
  );
  assert.throws(
    () => verifyPaymentTransaction(request, "wrong-signature", response),
    /signature/,
  );
  assert.throws(
    () =>
      buildPaymentTransaction(
        request,
        new PublicKey(first),
        svm.latestBlockhash(),
      ),
    /paying wallet/,
  );
}

test("receipt verifies executed payment and rejects tampering", () => {
  checkExecutedReceipt(false);
});

test("receipt verifies payment with Phantom fee instructions and rejects tampering", () => {
  checkExecutedReceipt(true);
});

test("API input refuses oversized JSON and cross-origin mutation", async () => {
  const makeRequest = (body: string, origin = "http://localhost:3000") =>
    new Request("http://localhost:3000/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body,
    });
  await assert.rejects(
    readJson(makeRequest(JSON.stringify({ value: "a".repeat(9000) }))),
    /too large/,
  );
  await assert.rejects(
    readJson(makeRequest("{}", "https://example.com")),
    /Cross-origin/,
  );
  assert.deepEqual(await readJson(makeRequest("{}")), {});
  const normalized = new Request("http://localhost:3000/api/requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "127.0.0.1:3000",
      origin: "http://127.0.0.1:3000",
    },
    body: "{}",
  });
  assert.deepEqual(await readJson(normalized), {});
});
