import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { parseAmount, splitAmount } from "./money";

export const walletSchema = z
  .string()
  .trim()
  .refine((value) => {
    try {
      const key = new PublicKey(value);
      return (
        !key.equals(PublicKey.default) && PublicKey.isOnCurve(key.toBytes())
      );
    } catch {
      return false;
    }
  }, "Enter a valid Solana wallet address.");

export const requestInputSchema = z
  .object({
    title: z.string().trim().min(1, "Give this project a name.").max(80),
    note: z.string().trim().max(240).default(""),
    amount: z.string().trim(),
    firstPercent: z.number().int().min(1).max(99),
    recipients: z.tuple([
      z
        .object({
          name: z.string().trim().min(1).max(32),
          wallet: walletSchema,
        })
        .strict(),
      z
        .object({
          name: z.string().trim().min(1).max(32),
          wallet: walletSchema,
        })
        .strict(),
    ]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.recipients[0].wallet === value.recipients[1].wallet)
      ctx.addIssue({
        code: "custom",
        message: "Use two different recipient wallets.",
        path: ["recipients"],
      });
    try {
      splitAmount(parseAmount(value.amount), value.firstPercent);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: (error as Error).message,
        path: ["amount"],
      });
    }
  });

export const signedRequestSchema = requestInputSchema.safeExtend({
  version: z.literal(1),
  reference: walletSchema,
  createdAt: z.number().int().positive(),
});
