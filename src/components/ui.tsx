import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";

export function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="Paypicnic home">
          <Image
            src="/paypicnic-logo.webp"
            alt="Paypicnic"
            width={660}
            height={220}
            className="brand-logo"
            loading="eager"
            unoptimized
          />
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/">Create a link</Link>
          <Link href="/#how-it-works" className="nav-help">
            How it works <ArrowUpRight size={14} />
          </Link>
        </nav>
        <span className="network-badge">
          <span />
          Solana devnet
        </span>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <span>Made for teams of two.</span>
      <span>
        <ShieldCheck size={14} /> Test tokens only. No real money.
      </span>
    </footer>
  );
}

export function TestNotice() {
  return (
    <div className="test-notice">
      <span className="tiny-dot" />
      <span>
        You’re on devnet. Payments use test USDC with no monetary value.
      </span>
    </div>
  );
}

export function Steps() {
  return (
    <section
      className="how-it-works"
      id="how-it-works"
      aria-label="How it works"
    >
      {[
        [
          "01",
          "Agree on your shares",
          "Set an amount, add two wallets, and choose the split.",
        ],
        [
          "02",
          "Send one payment link",
          "Your client reviews the breakdown and approves in their wallet.",
        ],
        [
          "03",
          "Get paid together",
          "Both transfers succeed together. One verified receipt for everyone.",
        ],
      ].map(([number, title, text]) => (
        <div key={number}>
          <span className="step-number">{number}</span>
          <h3>{title}</h3>
          <p>{text}</p>
        </div>
      ))}
    </section>
  );
}
