export type Recipient = { name: string; wallet: string };
export type PaymentRequest = {
  version: 1;
  reference: string;
  createdAt: number;
  title: string;
  note: string;
  amount: string;
  firstPercent: number;
  recipients: [Recipient, Recipient];
};
export type Receipt = {
  signature: string;
  payer: string;
  slot: number;
  timestamp: number | null;
  amounts: [string, string];
  feeLamports: number;
};
export type PaymentStatus =
  | { status: "unpaid" }
  | { status: "paid"; receipt: Receipt };
export type PreparedPayment = {
  transaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
  feeLamports: number;
  rentLamports: number;
};
