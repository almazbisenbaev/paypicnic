import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

if (existsSync(".env.local")) {
  console.log(
    ".env.local already exists; keeping your signing secret and payment links.",
  );
} else {
  writeFileSync(
    ".env.local",
    `PAYMENT_LINK_SECRET=${randomBytes(32).toString("hex")}\nSOLANA_RPC_URL=https://api.devnet.solana.com\n`,
    { mode: 0o600 },
  );
  console.log(
    "Created .env.local with a private signing secret. Ready for npm run dev.",
  );
}
