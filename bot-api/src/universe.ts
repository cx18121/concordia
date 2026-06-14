/**
 * Tradable universe — the mock stock tokens (mNVDA, mAAPL, …) the fund swaps on Uniswap v4.
 * `asset` is the bytes32 key used on-chain by Governance.castVote; the contract uses the same
 * convention. Interfaces stay identical to real Dinari/xStocks tokens for a mainnet drop-in.
 */

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

/** Encode a ticker as bytes32 (right-padded hex) — matches the on-chain key. */
export function toBytes32(ticker: string): `0x${string}` {
  const hex = Buffer.from(ticker, "utf8").toString("hex");
  return ("0x" + hex.padEnd(64, "0")) as `0x${string}`;
}
