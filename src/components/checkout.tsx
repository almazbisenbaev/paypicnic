"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import bs58 from "bs58";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { SplitPreview } from "./split-preview";
import { WalletPicker, type WalletSession } from "./wallet-picker";
import { CHAIN, explorerTransaction } from "@/lib/config";
import { formatUnits, parseAmount, shortAddress } from "@/lib/money";
import type { PaymentRequest, PreparedPayment, Receipt } from "@/lib/types";

type Pending = { signature?: string; lastValidBlockHeight?: number };
async function api<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || "Could not check this payment. Please try again.",
    );
  return data;
}

export function Checkout({
  request,
  token,
  initialSignature,
}: {
  request: PaymentRequest;
  token: string;
  initialSignature?: string;
}) {
  const [wallet, setWallet] = useState<WalletSession | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [prepared, setPrepared] = useState<PreparedPayment | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);
  const [statusChecked, setStatusChecked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signatureInput, setSignatureInput] = useState("");
  const [copied, setCopied] = useState(false);
  // Preserve pending payment recovery across the app rename.
  const storageKey = `splitkit:pending:${request.reference}`;

  const savePending = useCallback(
    (value: Pending | null) => {
      pendingRef.current = value;
      setPending(value);
      try {
        if (value) localStorage.setItem(storageKey, JSON.stringify(value));
        else localStorage.removeItem(storageKey);
      } catch {
        /* Keep in-memory recovery if storage is unavailable. */
      }
    },
    [storageKey],
  );

  const acceptReceipt = useCallback(
    (value: Receipt) => {
      setReceipt(value);
      setError("");
      setNotice("");
      setPrepared(null);
      savePending(null);
      window.history.replaceState(
        null,
        "",
        `/pay/${token}?tx=${value.signature}`,
      );
    },
    [savePending, token],
  );

  const checkStatus = useCallback(
    async (recovery?: Pending | null) => {
      const attempt = recovery === undefined ? pendingRef.current : recovery;
      setError("");
      if (attempt?.signature) {
        const verified = await api<{ status: string; receipt?: Receipt }>(
          "/api/verify",
          { token, signature: attempt.signature },
        );
        if (verified.receipt) {
          acceptReceipt(verified.receipt);
          setStatusChecked(true);
          return true;
        }
      }
      const data = await api<{
        status: string;
        receipt?: Receipt;
        canRetry: boolean;
      }>("/api/status", {
        token,
        lastValidBlockHeight: attempt?.lastValidBlockHeight,
      });
      setStatusChecked(true);
      if (data.receipt) {
        acceptReceipt(data.receipt);
        return true;
      }
      if (attempt && data.canRetry) {
        savePending(null);
        setPrepared(null);
        setNotice(
          "The previous transaction expired without a verified payment. You can try again.",
        );
      } else if (attempt) {
        setNotice(
          "Waiting for a verified payment. Check again shortly; don’t send a second payment while this one is pending.",
        );
      }
      return false;
    },
    [acceptReceipt, savePending, token],
  );

  useEffect(() => {
    let active = true;
    let recovery: Pending | null = initialSignature
      ? { signature: initialSignature }
      : null;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (
        stored &&
        (typeof stored.signature === "string" ||
          typeof stored.lastValidBlockHeight === "number")
      )
        recovery = initialSignature
          ? { ...stored, signature: initialSignature }
          : stored;
    } catch {
      /* A receipt URL works without local storage. */
    }
    if (recovery) savePending(recovery);
    setBusy("Checking payment status…");
    busyRef.current = true;
    checkStatus(recovery)
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) {
          setBusy("");
          busyRef.current = false;
        }
      });
    return () => {
      active = false;
    };
  }, [checkStatus, initialSignature, savePending, storageKey]);

  useEffect(() => {
    if (!wallet) return;
    return wallet.wallet.features["standard:events"].on(
      "change",
      ({ accounts }) => {
        if (!accounts) return;
        const account = accounts.find(
          (a) =>
            a.address === wallet.account.address && a.chains.includes(CHAIN),
        );
        if (!account) {
          setWallet(null);
          setPrepared(null);
          setNotice("Your wallet account changed. Reconnect to continue.");
        }
      },
    );
  }, [wallet]);

  async function refresh() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("Checking payment status…");
    try {
      await checkStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
      busyRef.current = false;
    }
  }

  async function prepare() {
    if (!wallet || busyRef.current || pendingRef.current) return;
    busyRef.current = true;
    setBusy("Checking balances and preparing payment…");
    setError("");
    setNotice("");
    try {
      setPrepared(
        await api<PreparedPayment>("/api/prepare", {
          token,
          payer: wallet.account.address,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
      busyRef.current = false;
    }
  }

  async function pay() {
    if (!wallet || !prepared || busyRef.current || pendingRef.current) return;
    busyRef.current = true;
    setBusy("Approve the payment in your wallet…");
    setError("");
    setNotice("");
    // Refresh the blockhash and balances after the review step, then persist the
    // intent before handing control to a wallet (which can close or time out).
    let sent = false;
    try {
      const fresh = await api<PreparedPayment>("/api/prepare", {
        token,
        payer: wallet.account.address,
      });
      if (
        fresh.feeLamports + fresh.rentLamports >
        prepared.feeLamports + prepared.rentLamports
      ) {
        setPrepared(fresh);
        setNotice(
          "The estimated network cost changed. Review it below and approve again.",
        );
        return;
      }
      if (
        !wallet.wallet.accounts.some(
          (account) =>
            account.address === wallet.account.address &&
            account.chains.includes(CHAIN),
        )
      )
        throw new Error(
          "Your wallet account changed. Reconnect before paying.",
        );
      const intent: Pending = {
        lastValidBlockHeight: fresh.lastValidBlockHeight,
      };
      savePending(intent);
      const [result] = await wallet.wallet.features[
        "solana:signAndSendTransaction"
      ].signAndSendTransaction({
        account: wallet.account,
        chain: CHAIN,
        transaction: Uint8Array.from(atob(fresh.transaction), (character) =>
          character.charCodeAt(0),
        ),
        options: {
          preflightCommitment: "confirmed",
          skipPreflight: false,
          maxRetries: 3,
        },
      });
      if (!result)
        throw new Error("Your wallet did not return a transaction signature.");
      sent = true;
      const signature = bs58.encode(result.signature);
      const attempt = { ...intent, signature };
      savePending(attempt);
      setPrepared(null);
      setBusy("Sent. Verifying both transfers on Solana…");
      for (let i = 0; i < 12; i++) {
        const verified = await api<{ status: string; receipt?: Receipt }>(
          "/api/verify",
          { token, signature },
        );
        if (verified.receipt) {
          acceptReceipt(verified.receipt);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      setNotice(
        "The transaction was sent and is still awaiting confirmation. You can safely check its status below.",
      );
    } catch (err) {
      const value = err as Error & { code?: number };
      if (
        !sent &&
        (value.code === 4001 || /reject|declin|cancel/i.test(value.message))
      ) {
        savePending(null);
        setPrepared(null);
        setNotice("You cancelled the wallet request. No payment was approved.");
      } else {
        setError(
          pendingRef.current
            ? "We couldn’t confirm the wallet’s result yet. Check payment status or use your wallet’s transaction signature below before trying another payment."
            : value.message,
        );
      }
    } finally {
      setBusy("");
      busyRef.current = false;
    }
  }

  async function recover(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("Verifying transaction…");
    setError("");
    try {
      const signature = signatureInput.trim();
      const result = await api<{ status: string; receipt?: Receipt }>(
        "/api/verify",
        { token, signature },
      );
      if (result.receipt) acceptReceipt(result.receipt);
      else {
        savePending({ ...pendingRef.current, signature });
        setNotice(
          "This transaction is not confirmed yet. Check its status again shortly.",
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
      busyRef.current = false;
    }
  }

  async function copyReceipt() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setNotice("Copy the address from your browser to share this receipt.");
    }
  }

  return (
    <main className="checkout-main">
      <Link className="back-link" href="/">
        <ArrowLeft size={15} /> Create your own payment link
      </Link>
      <div className="checkout-intro">
        <span className="eyebrow">
          {receipt
            ? "GOOD WORK. PAID TOGETHER."
            : "ONE PAYMENT. EVERYONE’S SHARE."}
        </span>
        <h1>
          {receipt ? "All split. All settled." : "Pay the people behind it."}
        </h1>
        <p>
          {receipt
            ? "Both transfers have been verified on Solana devnet."
            : "Review the agreed split, connect your wallet, and pay your team together."}
        </p>
      </div>
      <div className="checkout-grid">
        <div>
          <SplitPreview {...request} checkout />
          {request.note && (
            <div className="client-note">
              <span className="eyebrow">A NOTE FROM THE TEAM</span>
              <p>{request.note}</p>
            </div>
          )}
        </div>
        <section
          className="checkout-panel"
          aria-label={receipt ? "Verified payment receipt" : "Pay this request"}
        >
          {receipt ? (
            <>
              <div className="success-icon">
                <CheckCheck size={30} />
              </div>
              <span className="paid-badge">
                <Check size={13} /> Payment confirmed
              </span>
              <h2>Everyone got their share.</h2>
              <p className="muted">One transaction, two verified transfers.</p>
              <div className="receipt-amounts">
                {request.recipients.map((r, i) => (
                  <div key={r.wallet}>
                    <span>
                      <Check size={15} />
                      {r.name}
                    </span>
                    <strong>
                      {formatUnits(receipt.amounts[i])}
                      <small> test USDC</small>
                    </strong>
                  </div>
                ))}
              </div>
              <dl className="receipt-details">
                <div>
                  <dt>Network</dt>
                  <dd>Solana devnet</dd>
                </div>
                <div>
                  <dt>Paid by</dt>
                  <dd title={receipt.payer}>{shortAddress(receipt.payer)}</dd>
                </div>
                <div>
                  <dt>Confirmed at</dt>
                  <dd>
                    {receipt.timestamp
                      ? new Date(receipt.timestamp * 1000).toLocaleString()
                      : `Slot ${receipt.slot}`}
                  </dd>
                </div>
                <div>
                  <dt>Transaction fee</dt>
                  <dd>{receipt.feeLamports / 1e9} devnet SOL</dd>
                </div>
              </dl>
              <a
                className="button primary"
                href={explorerTransaction(receipt.signature)}
                target="_blank"
                rel="noreferrer"
              >
                View transaction <ArrowUpRight size={17} />
              </a>
              <button className="button secondary" onClick={copyReceipt}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Receipt link copied" : "Copy receipt link"}
              </button>
              <p className="helper">
                This receipt verifies a devnet payment with test tokens. It is
                not proof of a real-money payment.
              </p>
            </>
          ) : (
            <>
              <span className="checkout-lock">
                <ShieldCheck size={23} />
              </span>
              <h2>
                {pending
                  ? "Let’s check your payment."
                  : "A fair split, in one click."}
              </h2>
              <p className="muted">
                Your payment goes directly to both wallets. Paypicnic never holds
                the funds.
              </p>
              <div className="checkout-total">
                <span>You’re paying</span>
                <strong>
                  {formatUnits(parseAmount(request.amount))}{" "}
                  <small>test USDC</small>
                </strong>
              </div>
              {wallet && (
                <div className="connected-wallet">
                  <span>
                    <Wallet size={16} /> {wallet.wallet.name}{" "}
                    <strong>{shortAddress(wallet.account.address)}</strong>
                  </span>
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() => {
                      setWallet(null);
                      setPrepared(null);
                    }}
                  >
                    Change
                  </button>
                </div>
              )}
              {prepared && !pending && (
                <div className="cost-review">
                  <strong>Review network costs</strong>
                  <dl>
                    <div>
                      <dt>Transaction fee</dt>
                      <dd>{prepared.feeLamports / 1e9} SOL</dd>
                    </div>
                    <div>
                      <dt>New recipient token accounts</dt>
                      <dd>{prepared.rentLamports / 1e9} SOL</dd>
                    </div>
                  </dl>
                  <p>
                    Paid by your wallet in devnet SOL, in addition to the test
                    USDC above. The wallet asks for your final approval.
                  </p>
                </div>
              )}
              {busy && (
                <p className="progress-message" role="status">
                  <LoaderCircle size={17} className="spin" />
                  {busy}
                </p>
              )}
              {error && (
                <p className="error-box" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="inline-notice" role="status">
                  {notice}
                </p>
              )}
              {pending ? (
                <>
                  <button
                    className="button primary"
                    onClick={refresh}
                    disabled={!!busy}
                  >
                    <RefreshCw size={16} />
                    Check payment status
                  </button>
                  {pending.signature && (
                    <a
                      className="button secondary"
                      href={explorerTransaction(pending.signature)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View pending transaction <ExternalLink size={15} />
                    </a>
                  )}
                </>
              ) : !statusChecked ? (
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={refresh}
                >
                  <RefreshCw size={16} />
                  {busy ? "Checking status…" : "Retry status check"}
                </button>
              ) : !wallet ? (
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={() => setWalletOpen(true)}
                >
                  <Wallet size={17} />
                  Connect wallet <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={prepared ? pay : prepare}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Wallet size={17} />
                  )}
                  {prepared ? "Approve in wallet" : "Review payment"}
                  <ArrowRight size={17} />
                </button>
              )}
              <p className="helper centered">
                Both transfers succeed together or neither does.
                <br />
                Network fees still apply to failed transactions.
              </p>
              <div className="checkout-tools">
                <details>
                  <summary>Need test tokens?</summary>
                  <p>
                    Enable devnet in your Solana wallet. Get test USDC for the
                    payment and devnet SOL for fees. Use a separate client
                    wallet from the two recipient wallets.
                  </p>
                  <div className="faucet-links">
                    <a
                      href="https://faucet.circle.com/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Test USDC faucet <ArrowUpRight size={13} />
                    </a>
                    <a
                      href="https://faucet.solana.com/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Devnet SOL faucet <ArrowUpRight size={13} />
                    </a>
                  </div>
                </details>
                <details>
                  <summary>Already sent a payment?</summary>
                  <p>
                    Check for an existing payment, or paste the transaction
                    signature from your wallet. We’ll verify that it matches
                    this link.
                  </p>
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={refresh}
                  >
                    <RefreshCw size={13} />
                    Check for a payment
                  </button>
                  <form onSubmit={recover}>
                    <label htmlFor="signature">Transaction signature</label>
                    <input
                      id="signature"
                      required
                      value={signatureInput}
                      onChange={(e) => setSignatureInput(e.target.value)}
                      spellCheck={false}
                      autoCapitalize="none"
                      maxLength={90}
                      placeholder="Paste the full transaction signature"
                    />
                    <button className="button secondary" disabled={!!busy}>
                      Verify payment
                    </button>
                  </form>
                </details>
              </div>
            </>
          )}
          {receipt && notice && (
            <p className="inline-notice" role="status">
              {notice}
            </p>
          )}
        </section>
      </div>
      <WalletPicker
        open={walletOpen}
        close={() => setWalletOpen(false)}
        onConnect={(value) => {
          setWallet(value);
          setPrepared(null);
          setError("");
        }}
      />
    </main>
  );
}
