# Paypicnic

One payment link, two collaborators, one verified receipt.

Paypicnic splits a client payment between two freelance collaborators in a single Solana transaction. Built with Next.js, TypeScript, Solana Wallet Standard, and standard SPL token instructions.

**Devnet prototype. Uses test USDC only, with no monetary value.** No accounts, database, escrow, custom on-chain program, or platform fees.

## Run locally

Requires Node.js 22 or later.

```sh
npm ci
npm run setup
npm run dev
```

Open <http://127.0.0.1:3000>. The setup script creates an ignored `.env.local` with a random signing secret and preserves any existing file. Keep that secret stable so existing payment links remain valid.

```sh
npm run check  # TypeScript and tests
npm run build
npm start
```

## Test a payment

1. Use a browser wallet that supports Solana Wallet Standard, `solana:signAndSendTransaction`, and `solana:devnet`. Enable devnet in the wallet.
2. Use three distinct wallets: one client and two recipients. The client cannot also be a recipient.
3. Fund the client with test USDC on Solana devnet from [Circle's faucet](https://faucet.circle.com/) and devnet SOL from [Solana's faucet](https://faucet.solana.com/).
4. Create a payment link for `10` test USDC with a `70 / 30` split and the two recipient addresses. The **Try example** button fills sample data; replace its addresses with wallets you control.
5. Open the link, connect the client wallet, review the amounts and network/account costs, and approve the transaction.
6. The verified receipt should show `7.00` and `3.00` test USDC and link to the devnet explorer.

Use **Check payment status** if confirmation is slow. If the wallet submitted a transaction but the browser missed its response, enter the signature under **Already sent a payment?** Check a pending transaction before attempting another payment.

## How it works

- The server signs each immutable payment request with HMAC-SHA256. The link contains the project details and public wallet addresses; it is signed, not encrypted.
- Amounts use integer base units with up to six decimal places. Splits range from 1% to 99%; the second recipient receives any rounding remainder.
- One transaction creates missing associated token accounts and sends both shares directly from the client. Both transfers succeed together or roll back.
- A unique public reference and a memo bind the transaction to the request.
- The server verifies the devnet genesis hash, successful transaction result, canonical transaction message, paying signer, and both recipient balance increases before showing a receipt.
- Confirmed payments are found through the request reference. Recent links and pending payment attempts are stored locally in the browser.

## Tests

`npm run check` runs TypeScript checks and the tests in `tests/payments.test.ts`. The suite uses LiteSVM to execute the standard SPL programs, covering split calculations, account creation, atomic rollback, input validation, signed-link tampering, replay checks, and receipt verification.

A separate devnet smoke test uses disposable test wallets:

```sh
npm run smoke:devnet
npm run smoke:devnet -- --airdrop
# Fund the printed client address with test USDC, then:
npm run smoke:devnet -- --send
```

The script sends 10 test USDC and verifies a 7/3 split. Private test keys stay in the ignored `.local/devnet-wallets.json`; never fund these wallets with real assets. Local tests and the CLI smoke test do not verify a browser wallet's approval flow.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PAYMENT_LINK_SECRET` | Server-only signing secret, at least 32 characters. Keep the same value across instances and deployments. |
| `SOLANA_RPC_URL` | Optional server-only devnet RPC endpoint. Defaults to `https://api.devnet.solana.com`. Other networks are rejected. |

The app requires a Node.js Next.js host. For remote access, configure the environment variables and serve the app over HTTPS. Links created on `127.0.0.1` only work on that computer.

## Limitations

- Devnet only; no production payment support.
- Exactly two recipients and Circle's test USDC mint.
- No exactly-once settlement guarantee: simultaneous clients can pay the same request more than once.
- Anyone with a link can read its details. Recipient names are display labels, not verified identities. Avoid private client information in request notes.
- Public RPC availability, history, faucet limits, and devnet resets can affect payments and receipts.
- Wallets that rewrite the canonical transaction or add instructions are unsupported.
- The legacy Solana SDK dependency tree has known upstream advisories involving `bigint-buffer` and `jayson`. These need resolution before production use.
- Authentication, refunds, cancellation, durable receipt indexing, and public API abuse controls are outside this prototype.

## References

- [Solana token transfers](https://solana.com/docs/tokens/basics/transfer-tokens)
- [Solana transaction RPC](https://solana.com/docs/rpc/http/gettransaction)
- [Wallet Standard](https://github.com/wallet-standard/wallet-standard)
- [Circle test USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [LiteSVM](https://github.com/LiteSVM/litesvm)
