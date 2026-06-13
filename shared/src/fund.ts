import { type PublicClient, type WalletClient, stringToHex } from "viem";
import { addresses } from "./addresses.js";
import { governanceAbi, oracleAbi } from "./abi.js";
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
