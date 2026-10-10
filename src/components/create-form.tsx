"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Link2,
  LoaderCircle,
  Sparkles,
  Wallet,
} from "lucide-react";
import { SplitPreview } from "./split-preview";
import type { PaymentRequest, Recipient } from "@/lib/types";
import { formatUnits, parseAmount } from "@/lib/money";

type Saved = {
  token: string;
  title: string;
  amount: string;
  createdAt: number;
};
// Preserve saved payment links across the app rename.
const RECENTS_KEY = "splitkit:recent:v1";

export function CreateForm() {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("500");
  const [firstPercent, setFirstPercent] = useState(70);
  const [recipients, setRecipients] = useState<[Recipient, Recipient]>([
    { name: "Developer", wallet: "" },
    { name: "Designer", wallet: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{
    token: string;
    request: PaymentRequest;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [recents, setRecents] = useState<Saved[]>([]);
  const [example, setExample] = useState(false);
  const [storageNotice, setStorageNotice] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(RECENTS_KEY) || "[]",
      );
      if (Array.isArray(value))
        setRecents(
          value
            .filter(
              (v) =>
                typeof v.token === "string" &&
                /^[\w-]+\.[\w-]+$/.test(v.token) &&
                typeof v.title === "string" &&
                typeof v.amount === "string",
            )
            .slice(0, 5),
        );
    } catch {
      /* Browser storage is optional. */
    }
  }, []);

  function updateRecipient(
    index: number,
    field: keyof Recipient,
    value: string,
  ) {
    setRecipients(
      (previous) =>
        previous.map((recipient, i) =>
          i === index ? { ...recipient, [field]: value } : recipient,
        ) as [Recipient, Recipient],
    );
  }

  function fillExample() {
    setTitle("Website design & development");
    setNote("Thanks for building with us. Here’s the agreed 70/30 split.");
    setAmount("10");
    setFirstPercent(70);
    setRecipients([
      {
        name: "Example developer",
        wallet: "48CJjvtDj4rAvxLeLy6RfGEaZHqYWPqcJzWhYh1RvJuP",
      },
      {
        name: "Example designer",
        wallet: "2q47HkmBd83md2RosQHFnpqY11p9oZdHMHbctak7vrNv",
      },
    ]);
    setExample(true);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, note, amount, firstPercent, recipients }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not create the link.");
      setCreated(data);
      setCopied(false);
      const next: Saved[] = [
        {
          token: data.token,
          title: data.request.title,
          amount: data.request.amount,
          createdAt: Date.now(),
        },
        ...recents,
      ].slice(0, 5);
      setRecents(next);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        setStorageNotice(
          "Browser storage is unavailable. Copy your link to keep it.",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create the link. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const shareUrl = created ? `${origin}/pay/${created.token}` : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setStorageNotice("Select the link above and copy it manually.");
    }
  }

  return (
    <>
      <div className="workspace-grid">
        <section className="form-card" aria-label="Create a payment link">
          {created ? (
            <div className="created-panel">
              <div className="success-icon">
                <Check size={28} />
              </div>
              <span className="eyebrow">READY TO SHARE</span>
              <h2>Your team’s link is ready.</h2>
              <p>
                Send it to your client. They’ll see the exact split before
                approving the payment.
              </p>
              <label htmlFor="share-link">Payment link</label>
              <input
                id="share-link"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.target.select()}
              />
              <div className="created-actions">
                <button className="button primary" onClick={copy}>
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                  {copied ? "Copied" : "Copy payment link"}
                </button>
                <Link
                  className="button secondary"
                  href={`/pay/${created.token}`}
                >
                  Open checkout <ExternalLink size={16} />
                </Link>
              </div>
              <p className="helper">
                Anyone with this link can view its project details and recipient
                wallets. The link’s details are fixed.
              </p>
              {origin.includes("localhost") || origin.includes("127.0.0.1") ? (
                <p className="inline-notice">
                  This local link works on this computer. Deploy the app before
                  sharing it with another person.
                </p>
              ) : null}
              {storageNotice && (
                <p role="status" className="inline-notice">
                  {storageNotice}
                </p>
              )}
              <button
                className="text-button"
                onClick={() => {
                  setCreated(null);
                  setCopied(false);
                }}
              >
                Create another link <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="form-heading">
                <div>
                  <span className="eyebrow">LET’S MAKE IT OFFICIAL</span>
                  <h2>Create a payment link</h2>
                </div>
                <button
                  type="button"
                  className="example-button"
                  onClick={fillExample}
                >
                  <Sparkles size={14} /> Try example
                </button>
              </div>
              <fieldset>
                <legend>
                  <span className="section-number">1</span>The project
                </legend>
                <label htmlFor="project">Project name</label>
                <input
                  id="project"
                  required
                  maxLength={80}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. A fresh website for Studio North"
                />
                <div className="amount-label">
                  <label htmlFor="amount">Total payment</label>
                  <span>Solana devnet</span>
                </div>
                <div className="amount-input">
                  <span className="coin">$</span>
                  <input
                    id="amount"
                    required
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-describedby="amount-help"
                  />
                  <span>test USDC</span>
                </div>
                <p id="amount-help" className="helper">
                  The client pays this amount, plus Solana network and account
                  fees.
                </p>
                <label htmlFor="note">
                  Note for your client{" "}
                  <span className="optional">Optional</span>
                </label>
                <textarea
                  id="note"
                  rows={2}
                  maxLength={240}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="A little context, a thank you, or what’s included."
                />
              </fieldset>
              <fieldset>
                <legend>
                  <span className="section-number">2</span>The people behind it
                </legend>
                <div className="recipient-inputs">
                  {recipients.map((recipient, index) => (
                    <div
                      className={`recipient-input recipient-input-${index}`}
                      key={index}
                    >
                      <div className="recipient-input-title">
                        <span className={`recipient-dot dot-${index}`} />
                        Teammate {index + 1}
                        <span className="share-pill">
                          {index === 0 ? firstPercent : 100 - firstPercent}%
                        </span>
                      </div>
                      <label htmlFor={`name-${index}`}>Name or role</label>
                      <input
                        id={`name-${index}`}
                        required
                        maxLength={32}
                        value={recipient.name}
                        onChange={(e) =>
                          updateRecipient(index, "name", e.target.value)
                        }
                      />
                      <label htmlFor={`wallet-${index}`}>
                        <Wallet size={13} /> Solana wallet address
                      </label>
                      <input
                        id={`wallet-${index}`}
                        className="wallet-input"
                        required
                        autoCapitalize="none"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={44}
                        value={recipient.wallet}
                        onChange={(e) =>
                          updateRecipient(index, "wallet", e.target.value)
                        }
                        placeholder="Paste a wallet address"
                      />
                    </div>
                  ))}
                </div>
                {example && (
                  <p className="inline-notice">
                    These are example wallets for test tokens. Replace them with
                    your team’s wallets to receive the payment.
                  </p>
                )}
                <div className="split-heading">
                  <label htmlFor="split">How do you split it?</label>
                  <div className="split-values">
                    <input
                      type="number"
                      aria-label="First teammate percentage"
                      min={1}
                      max={99}
                      value={firstPercent}
                      onChange={(e) =>
                        setFirstPercent(
                          Math.max(
                            1,
                            Math.min(99, Number(e.target.value) || 1),
                          ),
                        )
                      }
                    />
                    <span>% / {100 - firstPercent}%</span>
                  </div>
                </div>
                <input
                  id="split"
                  type="range"
                  min={1}
                  max={99}
                  value={firstPercent}
                  onChange={(e) => setFirstPercent(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, var(--orange) ${firstPercent}%, var(--violet) ${firstPercent}%)`,
                  }}
                />
                <div className="range-labels">
                  <span>{recipients[0].name || "Teammate 1"}</span>
                  <span>{recipients[1].name || "Teammate 2"}</span>
                </div>
              </fieldset>
              {error && (
                <p role="alert" className="error-box">
                  {error}
                </p>
              )}
              <button className="button primary create-button" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Link2 size={18} />
                )}
                {busy ? "Creating your link…" : "Create payment link"}
                <ArrowRight size={18} />
              </button>
              <p className="form-footer">No account needed. No platform fee.</p>
            </form>
          )}
        </section>
        <aside className="preview-column">
          <SplitPreview
            {...(created
              ? created.request
              : { title, amount, firstPercent, recipients })}
          />
          <div className="preview-note">
            <span className="note-symbol">↳</span>
            <p>
              Great work is a team effort.
              <br />
              <strong>Getting paid should be, too.</strong>
            </p>
          </div>
        </aside>
      </div>
      {recents.length > 0 && (
        <section className="recents">
          <div className="recents-heading">
            <h2>Your recent links</h2>
            <span>Saved in this browser</span>
          </div>
          {recents.map((item) => (
            <Link
              href={`/pay/${item.token}`}
              key={item.token}
              className="recent-item"
            >
              <span className="recent-icon">
                <Link2 size={18} />
              </span>
              <strong>{item.title}</strong>
              <span>
                {(() => {
                  try {
                    return formatUnits(parseAmount(item.amount));
                  } catch {
                    return item.amount;
                  }
                })()}{" "}
                <small>test USDC</small>
              </span>
              <ArrowUpRightIcon />
            </Link>
          ))}
        </section>
      )}
    </>
  );
}

function ArrowUpRightIcon() {
  return <ExternalLink size={15} aria-hidden />;
}
