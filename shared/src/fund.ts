import { type PublicClient, type WalletClient, stringToHex } from "viem";
import { addresses } from "./addresses.js";
import { governanceAbi, oracleAbi, vaultAbi, erc20Abi } from "./abi.js";
import { publicClient } from "./client.js";
import { CYCLE_STATE, type Cycle, type Pick, type Alloc } from "./types.js";

/** The votable asset universe (demo set). S&P (`^GSPC`) is the benchmark, not votable. */
export const UNIVERSE = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "JPM",
  "XOM", "UNH", "WMT", "SPY", "QQQ", "XLK", "XLF", "XLE", "XLV", "ARKK",
] as const;

/** Solidity `bytes32("NVDA")` — left-aligned, zero-padded. */
export const tickerToBytes32 = (ticker: string): `0x${string}` =>
  stringToHex(ticker, { size: 32 });

/** Current cycle id + state. Only vote when state === "OPEN". */
export async function getCycle(pub: PublicClient): Promise<Cycle> {
  const [id, st] = await Promise.all([
    pub.readContract({ address: addresses.governance, abi: governanceAbi, functionName: "cycleId" }),
    pub.readContract({ address: addresses.governance, abi: governanceAbi, functionName: "state" }),
  ]);
  return { id: id as bigint, state: CYCLE_STATE[Number(st)] };
}

/** A member's snapshotted voting power this cycle (bps of total). */
export const getVotingPower = (pub: PublicClient, member: `0x${string}`) =>
  pub.readContract({ address: addresses.governance, abi: governanceAbi, functionName: "votingPower", args: [member] }) as Promise<bigint>;

/** A member's smoothed accuracy (signed E4). */
export const getAccuracy = (pub: PublicClient, member: `0x${string}`) =>
  pub.readContract({ address: addresses.governance, abi: governanceAbi, functionName: "accuracyOf", args: [member] }) as Promise<bigint>;

/** Latest oracle prices (E8) for the given tickers (defaults to the whole universe). */
export async function getPrices(pub: PublicClient, tickers: readonly string[] = UNIVERSE) {
  const out: Record<string, bigint> = {};
  await Promise.all(
    tickers.map(async (t) => {
      out[t] = (await pub.readContract({
        address: addresses.oracle, abi: oracleAbi, functionName: "price", args: [tickerToBytes32(t)],
      })) as bigint;
    }),
  );
  return out;
}

/** Turn human picks ({ ticker, pct }) into on-chain Allocs. Picks must sum to 100. */
export function buildAllocs(picks: Pick[]): Alloc[] {
  const total = picks.reduce((s, p) => s + p.pct, 0);
  if (Math.round(total) !== 100) throw new Error(`picks must sum to 100% (got ${total})`);
  return picks.map((p) => ({ asset: tickerToBytes32(p.ticker), weightBps: Math.round(p.pct * 100) }));
}

/** Submit a vote. `wallet` must be a member wallet with voting power; only valid while OPEN. */
export const castVote = (wallet: WalletClient, allocs: Alloc[]) =>
  wallet.writeContract({
    address: addresses.governance,
    abi: governanceAbi,
    functionName: "castVote",
    args: [allocs],
    account: wallet.account!,
    chain: wallet.chain,
  });

// --------------------------------------------------------------------------
// Position + leaderboard reads
// --------------------------------------------------------------------------

/** A member's ERC-4626 position: shares held + their current USDC value (both raw, USDC 6dp). */
export async function getPosition(
  pub: PublicClient,
  user: `0x${string}`,
): Promise<{ shares: bigint; navUsd: bigint }> {
  const shares = (await pub.readContract({
    address: addresses.vault, abi: vaultAbi, functionName: "balanceOf", args: [user],
  })) as bigint;
  const navUsd =
    shares === 0n
      ? 0n
      : ((await pub.readContract({
          address: addresses.vault, abi: vaultAbi, functionName: "convertToAssets", args: [shares],
        })) as bigint);
  return { shares, navUsd };
}

/** Claimable reward balance (raw USDC, 6dp). */
export const getRewardCredit = (pub: PublicClient, user: `0x${string}`) =>
  pub.readContract({ address: addresses.vault, abi: vaultAbi, functionName: "rewardCredit", args: [user] }) as Promise<bigint>;

/** Resolved-cycle count. 0 = never scored, so accuracy should display as "unscored" (null). */
export const getCyclesParticipated = (pub: PublicClient, member: `0x${string}`) =>
  pub.readContract({ address: addresses.governance, abi: governanceAbi, functionName: "cyclesParticipated", args: [member] }) as Promise<bigint>;

/** Whether a wallet is verified (gates deposit). */
export const isVerified = (pub: PublicClient, user: `0x${string}`) =>
  pub.readContract({ address: addresses.vault, abi: vaultAbi, functionName: "verified", args: [user] }) as Promise<boolean>;

export interface LeaderboardEntry {
  member: `0x${string}`;
  votingPowerBps: bigint; // /100 -> percent
  accuracyE4: bigint; //     /100 -> percent (signed)
  cyclesParticipated: bigint; // 0 -> unscored
}

/** Every member ranked by accuracy, then capital. Raw values — the UI formats them. */
export async function getLeaderboard(pub: PublicClient): Promise<LeaderboardEntry[]> {
  const count = Number(
    (await pub.readContract({ address: addresses.governance, abi: governanceAbi, functionName: "memberCount" })) as bigint,
  );
  const members = (await Promise.all(
    [...Array(count).keys()].map((i) =>
      pub.readContract({ address: addresses.governance, abi: governanceAbi, functionName: "members", args: [BigInt(i)] }),
    ),
  )) as `0x${string}`[];

  const rows = await Promise.all(
    members.map(async (member) => {
      const [votingPowerBps, accuracyE4, cyclesParticipated] = await Promise.all([
        getVotingPower(pub, member),
        getAccuracy(pub, member),
        getCyclesParticipated(pub, member),
      ]);
      return { member, votingPowerBps, accuracyE4, cyclesParticipated };
    }),
  );

  rows.sort((a, b) => {
    if (a.accuracyE4 !== b.accuracyE4) return a.accuracyE4 > b.accuracyE4 ? -1 : 1;
    return a.votingPowerBps > b.votingPowerBps ? -1 : a.votingPowerBps < b.votingPowerBps ? 1 : 0;
  });
  return rows;
}

// --------------------------------------------------------------------------
// Writes (member wallet) — getWalletClient() in the web app, or a key in scripts
// --------------------------------------------------------------------------

/** "Get demo USDC": mint `amount` (raw, 6dp) of mock USDC to the wallet. Public faucet. */
export const getDemoUSDC = (wallet: WalletClient, amount: bigint) =>
  wallet.writeContract({
    address: addresses.usdc, abi: erc20Abi, functionName: "mint",
    args: [wallet.account!.address, amount], account: wallet.account!, chain: wallet.chain,
  });

/** Approve + deposit `amount` (raw USDC, 6dp) into the vault. Waits for approve before depositing
 *  (deposit pulls the USDC). Only valid while the cycle is IDLE/OPEN — reverts when LOCKED. */
export async function deposit(
  wallet: WalletClient,
  amount: bigint,
  pub: ReturnType<typeof publicClient> = publicClient(),
) {
  const approveHash = await wallet.writeContract({
    address: addresses.usdc, abi: erc20Abi, functionName: "approve",
    args: [addresses.vault, amount], account: wallet.account!, chain: wallet.chain,
  });
  await pub.waitForTransactionReceipt({ hash: approveHash });
  return wallet.writeContract({
    address: addresses.vault, abi: vaultAbi, functionName: "deposit",
    args: [amount], account: wallet.account!, chain: wallet.chain,
  });
}

/** Claim accrued rewards to the member wallet. */
export const claim = (wallet: WalletClient) =>
  wallet.writeContract({
    address: addresses.vault, abi: vaultAbi, functionName: "claimRewards",
    args: [], account: wallet.account!, chain: wallet.chain,
  });
