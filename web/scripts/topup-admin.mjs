// Top up the admin wallet's native ETH on Base Sepolia using the CDP faucet.
//
// The admin EOA pays gas for on-chain verify attestations (/api/verify) and the keeper's
// cycle writes. Base Sepolia gas is ~0.000003 ETH per write, so a handful of faucet claims
// lasts a long time. This loops the CDP faucet until the wallet reaches a target balance.
//
// Run (creds are the same ones used on Vercel — set them in web/.env.local or inline):
//   node scripts/topup-admin.mjs
//   TOPUP_TARGET_ETH=0.05 node scripts/topup-admin.mjs
//   TOPUP_ADDRESS=0x... node scripts/topup-admin.mjs   # default: derived from ADMIN_PRIVATE_KEY
//
// Needs: CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET. Optionally ADMIN_PRIVATE_KEY
// (to derive the address) and RPC_URL.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// --- load web/.env.local into process.env (without overriding anything already set) ---
const here = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(join(here, "..", ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // no .env.local — rely on real env vars
}

const { CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET, ADMIN_PRIVATE_KEY } = process.env;
const RPC_URL = process.env.RPC_URL ?? "https://sepolia.base.org";

// Guard creds BEFORE importing the SDK, so this fails clearly even when the SDK isn't installed.
if (!(CDP_API_KEY_ID && CDP_API_KEY_SECRET && CDP_WALLET_SECRET)) {
  console.error(
    "Missing CDP credentials. Set CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET\n" +
      "(same as on Vercel; from portal.cdp.coinbase.com) in web/.env.local or inline.",
  );
  process.exit(1);
}

const TARGET_ETH = Number(process.env.TOPUP_TARGET_ETH ?? "0.01");
const MAX_CLAIMS = Number(process.env.TOPUP_MAX_CLAIMS ?? "60");

const { createPublicClient, http, formatEther, parseEther } = await import("viem");
const { baseSepolia } = await import("viem/chains");

let address = process.env.TOPUP_ADDRESS;
if (!address) {
  if (!ADMIN_PRIVATE_KEY) {
    console.error("No TOPUP_ADDRESS and no ADMIN_PRIVATE_KEY to derive it from.");
    process.exit(1);
  }
  const { privateKeyToAccount } = await import("viem/accounts");
  address = privateKeyToAccount(ADMIN_PRIVATE_KEY).address;
}

const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });
const target = parseEther(String(TARGET_ETH));

const start = await pub.getBalance({ address });
console.log(`admin: ${address}`);
console.log(`balance: ${formatEther(start)} ETH  ·  target: ${TARGET_ETH} ETH`);
if (start >= target) {
  console.log("Already at/above target — nothing to do.");
  process.exit(0);
}

const { CdpClient } = await import("@coinbase/cdp-sdk");
const cdp = new CdpClient();

let claims = 0;
let balance = start;
while (balance < target && claims < MAX_CLAIMS) {
  claims++;
  try {
    const { transactionHash } = await cdp.evm.requestFaucet({
      address,
      network: "base-sepolia",
      token: "eth",
    });
    await pub.waitForTransactionReceipt({ hash: transactionHash });
    balance = await pub.getBalance({ address });
    console.log(`claim ${claims}: ${formatEther(balance)} ETH`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`claim ${claims} failed: ${msg}`);
    // Rate-limited or transient — stop rather than hammer the faucet.
    break;
  }
}

console.log(
  `\nDone. ${formatEther(balance)} ETH after ${claims} claim(s)` +
    (balance < target ? " (below target — re-run later; faucet is rate-limited)." : "."),
);
