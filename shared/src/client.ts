import { createPublicClient, createWalletClient, http, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// Server (keeper/API routes) sets RPC_URL (keyed CDP endpoint). In the browser that var
// isn't exposed, so fall back to the NEXT_PUBLIC one, then a keyless browser-capable node —
// never sepolia.base.org, which 403s in-browser and silently zeroes out all reads.
export const RPC_URL =
  process.env.RPC_URL ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://base-sepolia-rpc.publicnode.com";

/** Read-only client — for fetching cycle state, prices, voting power, leaderboard. */
export const publicClient = () =>
  createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });

/** Wallet client from a raw private key (demo agents / scripts). */
export const walletClientFromKey = (privateKey: `0x${string}`) =>
  createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: baseSepolia,
    transport: http(RPC_URL),
  });

/** Wallet client from any viem Account — e.g. a Dynamic server-wallet adapter. */
export const walletClientFromAccount = (account: Account) =>
  createWalletClient({ account, chain: baseSepolia, transport: http(RPC_URL) });
