"use client";
import { useEffect, useRef, useState } from "react";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import type {
  StandardConnectFeature,
  StandardEventsFeature,
  StandardDisconnectFeature,
} from "@wallet-standard/features";
import type { SolanaSignAndSendTransactionFeature } from "@solana/wallet-standard-features";
import { CHAIN } from "@/lib/config";
import { LoaderCircle, Wallet as WalletIcon, X } from "lucide-react";

export type SolanaWallet = Wallet & {
  features: StandardConnectFeature &
    StandardEventsFeature &
    SolanaSignAndSendTransactionFeature &
    Partial<StandardDisconnectFeature>;
};
export type WalletSession = { wallet: SolanaWallet; account: WalletAccount };
const supportsDevnet = (wallet: Wallet): wallet is SolanaWallet =>
  wallet.chains.includes(CHAIN) &&
  "standard:connect" in wallet.features &&
  "standard:events" in wallet.features &&
  "solana:signAndSendTransaction" in wallet.features;

export function WalletPicker({
  open,
  close,
  onConnect,
}: {
  open: boolean;
  close: () => void;
  onConnect: (session: WalletSession) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [wallets, setWallets] = useState<SolanaWallet[]>([]);
  const [connecting, setConnecting] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const registry = getWallets();
    const update = () => setWallets(registry.get().filter(supportsDevnet));
    update();
    const offRegister = registry.on("register", update);
    const offUnregister = registry.on("unregister", update);
    return () => {
      offRegister();
      offUnregister();
    };
  }, []);
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      setError("");
    } else dialog.current?.close();
  }, [open]);

  async function connect(wallet: SolanaWallet) {
    setConnecting(wallet.name);
    setError("");
    try {
      const { accounts } = await wallet.features["standard:connect"].connect();
      const account = accounts.find(
        (a) =>
          a.chains.includes(CHAIN) &&
          a.features.includes("solana:signAndSendTransaction"),
      );
      if (!account)
        throw new Error(
          "Choose a Solana account with devnet enabled in your wallet.",
        );
      onConnect({ wallet, account });
      close();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The wallet connection was cancelled.",
      );
    } finally {
      setConnecting("");
    }
  }

  return (
    <dialog
      ref={dialog}
      className="wallet-dialog"
      onCancel={close}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
      aria-labelledby="wallet-title"
    >
      <button
        className="icon-button modal-close"
        aria-label="Close wallet selection"
        onClick={close}
      >
        <X size={20} />
      </button>
      <div className="dialog-icon">
        <WalletIcon size={24} />
      </div>
      <h2 id="wallet-title">Connect your wallet</h2>
      <p>
        Use a Solana wallet with devnet enabled. You’ll approve the payment
        separately.
      </p>
      {wallets.length ? (
        <div className="wallet-list">
          {wallets.map((wallet) => (
            <button
              key={wallet.name}
              disabled={!!connecting}
              onClick={() => connect(wallet)}
            >
              {/* Wallet icons come from the local Wallet Standard registry. */}
              <img src={wallet.icon} alt="" width={30} height={30} />
              {wallet.name}
              {connecting === wallet.name && (
                <LoaderCircle size={16} className="spin" />
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="inline-notice">
          <strong>No compatible wallet detected.</strong>
          <p>
            Open this page in a browser with a Solana wallet extension, or in
            your wallet’s in-app browser. Enable devnet in the wallet settings,
            then reload this page.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <p className="helper">
        Paypicnic never asks for your recovery phrase or private key.
      </p>
    </dialog>
  );
}
