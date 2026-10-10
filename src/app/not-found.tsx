import Link from "next/link";
export default function NotFound() {
  return (
    <main className="invalid-page">
      <span className="eyebrow">404</span>
      <h1>That page went its own way.</h1>
      <p>Head back and create a payment link for your team.</p>
      <Link href="/" className="button primary">
        Back to Paypicnic
      </Link>
    </main>
  );
}
