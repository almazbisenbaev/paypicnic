import {
  ArrowDownLeft,
  ArrowUpRight,
  LockKeyhole,
  MoveUpRight,
} from "lucide-react";
import {
  formatUnits,
  parseAmount,
  shortAddress,
  splitAmount,
} from "@/lib/money";
import { explorerAddress } from "@/lib/config";
import type { Recipient } from "@/lib/types";

type Props = {
  title: string;
  amount: string;
  firstPercent: number;
  recipients: [Recipient, Recipient];
  checkout?: boolean;
};

export function SplitPreview({
  title,
  amount,
  firstPercent,
  recipients,
  checkout = false,
}: Props) {
  let total = "0.00";
  let amounts = ["0.00", "0.00"];
  try {
    const units = parseAmount(amount);
    total = formatUnits(units);
    amounts = splitAmount(units, firstPercent).map(formatUnits);
  } catch {
    /* Empty or partial form input. */
  }
  return (
    <div className={`split-preview ${checkout ? "checkout-preview" : ""}`}>
      <div className="preview-topline">
        <span>{checkout ? "PAYMENT REQUEST" : "LIVE PREVIEW"}</span>
        <span className="paper-icon">
          <MoveUpRight size={19} />
        </span>
      </div>
      <h2>{title || "Your next great project"}</h2>
      <p className="preview-caption">One payment. Two happy teammates.</p>
      <div className="preview-total">
        <span>{total}</span>
        <span className="currency">
          <span className="coin">$</span>test USDC
        </span>
      </div>
      <div
        className="allocation-bar"
        role="img"
        aria-label={`${firstPercent}% to ${recipients[0].name || "first recipient"}, ${100 - firstPercent}% to ${recipients[1].name || "second recipient"}`}
      >
        <span style={{ width: `${firstPercent}%` }} />
        <span style={{ width: `${100 - firstPercent}%` }} />
      </div>
      <div className="allocation-labels">
        <span>{firstPercent}%</span>
        <span>{100 - firstPercent}%</span>
      </div>
      <div className="preview-recipients">
        {recipients.map((recipient, index) => (
          <div className="preview-recipient" key={index}>
            <span className={`avatar avatar-${index}`}>
              {(recipient.name || (index ? "Designer" : "Developer"))
                .slice(0, 1)
                .toUpperCase()}
              <ArrowDownLeft size={10} />
            </span>
            <div className="recipient-identity">
              <strong>
                {recipient.name || (index ? "Designer" : "Developer")}
              </strong>
              {recipient.wallet && checkout ? (
                <a
                  href={explorerAddress(recipient.wallet)}
                  target="_blank"
                  rel="noreferrer"
                  title={recipient.wallet}
                >
                  {shortAddress(recipient.wallet)} <ArrowUpRight size={11} />
                </a>
              ) : (
                <small>
                  {recipient.wallet
                    ? shortAddress(recipient.wallet)
                    : "Wallet to be added"}
                </small>
              )}
            </div>
            <div className="recipient-share">
              <strong>{amounts[index]}</strong>
              <small>test USDC</small>
            </div>
          </div>
        ))}
      </div>
      <div className="preview-fee">
        <span>Paypicnic fee</span>
        <strong>
          0.00 <span>test USDC</span>
        </strong>
      </div>
      <div className="preview-footnote">
        <LockKeyhole size={14} />
        <span>Direct to their wallets. Always.</span>
      </div>
    </div>
  );
}
