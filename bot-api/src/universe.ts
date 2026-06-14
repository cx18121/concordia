/**
 * Tradable universe — the mock stock tokens (mNVDA, mAAPL, …) the fund swaps on Uniswap v4.
 * `asset` is the bytes32 key used on-chain by Governance.castVote; the contract uses the same
 * convention. Interfaces stay identical to real Dinari/xStocks tokens for a mainnet drop-in.
 */
import { tickerToBytes32 } from "@concordia/shared";

export const UNIVERSE = [
  { ticker: "mNVDA", name: "Nvidia" },
  { ticker: "mMSFT", name: "Microsoft" },
  { ticker: "mAAPL", name: "Apple" },
  { ticker: "mTSLA", name: "Tesla" },
  { ticker: "mAMZN", name: "Amazon" },
  { ticker: "mGOOGL", name: "Alphabet" },
  { ticker: "mMETA", name: "Meta" },
  { ticker: "mJPM", name: "JPMorgan" },
] as const;

export type Ticker = (typeof UNIVERSE)[number]["ticker"];

const TICKERS = new Set(UNIVERSE.map((u) => u.ticker));
export function isTicker(t: string): t is Ticker {
  return TICKERS.has(t as Ticker);
}

/**
 * Encode a ticker as the on-chain asset key. The contracts register assets as
 * `bytes32(bytes("NVDA"))` (no "m" prefix — that's only the mock-token name), so we strip the
 * leading "m" and reuse shared's exact encoding. This is the key Governance.castVote expects;
 * getting it wrong reverts with UnknownAsset.
 */
export function toBytes32(ticker: string): `0x${string}` {
  return tickerToBytes32(ticker.replace(/^m/, ""));
}
