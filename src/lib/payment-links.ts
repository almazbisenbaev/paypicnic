import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { requestInputSchema, signedRequestSchema } from "./validation";
import type { PaymentRequest } from "./types";
import { AppError } from "./errors";

function secret(): string {
  const value = process.env.PAYMENT_LINK_SECRET;
  if (!value || value.length < 32)
    throw new AppError(
      "Payment links are not configured. Run npm run setup, then restart the app.",
      503,
    );
  return value;
}

export function createPaymentLink(input: unknown): {
  token: string;
  request: PaymentRequest;
} {
  const data = requestInputSchema.parse(input);
  const request: PaymentRequest = {
    ...data,
    version: 1,
    reference: Keypair.generate().publicKey.toBase58(),
    createdAt: Date.now(),
  };
  const payload = Buffer.from(JSON.stringify(request)).toString("base64url");
  const mac = createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  return { token: `${payload}.${mac}`, request };
}

export function readPaymentLink(token: string): PaymentRequest {
  if (token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))
    throw new AppError("This payment link is incomplete or invalid.");
  const [payload, signature] = token.split(".");
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new AppError(
      "This payment link was changed or is no longer valid. Ask the creator for a new link.",
    );
  try {
    return signedRequestSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString()),
    );
  } catch {
    throw new AppError("This payment link contains invalid details.");
  }
}

export function paymentMemo(request: PaymentRequest): string {
  // Keep the v1 protocol identifier stable so existing receipts remain verifiable.
  return `splitkit:v1:${request.reference}:${createHash("sha256").update(JSON.stringify(request)).digest("hex")}`;
}
