import { Checkout } from "@/components/checkout";
import { readPaymentLink } from "@/lib/payment-links";
import Link from "next/link";
import { Link2Off } from "lucide-react";
import { AppError } from "@/lib/errors";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ tx?: string | string[] }>;
}) {
  const { token } = await params;
  const { tx } = await searchParams;
  try {
    const request = readPaymentLink(token);
    return (
      <Checkout
        key={request.reference}
        request={request}
        token={token}
        initialSignature={typeof tx === "string" ? tx : undefined}
      />
    );
  } catch (error) {
    return (
      <main className="invalid-page">
        <span className="dialog-icon">
          <Link2Off size={28} />
        </span>
        <h1>This link needs a second look.</h1>
        <p>
          {error instanceof AppError
            ? error.message
            : "This payment link could not be read. Ask the creator to send a new one."}
        </p>
        <Link className="button primary" href="/">
          Create a new payment link
        </Link>
      </main>
    );
  }
}
