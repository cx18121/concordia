import { createPublicClient, createWalletClient, http, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

export const RPC_URL = process.env.RPC_URL ?? "https://sepolia.base.org";

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
