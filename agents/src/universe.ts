/**
 * The tradable universe + S&P benchmark.
 *
 * `asset` is the bytes32 key used on-chain by Governance.castVote (IGovernance.Alloc.asset).
 * We key by the ticker string padded into bytes32; the contract uses the same convention.
 */

export const TICKERS = ["AAPL", "NVDA", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "JPM"] as const;
export type Ticker = (typeof TICKERS)[number];

export const SPX = "SPX" as const; // S&P 500 benchmark — not tradable, used for excess return

export const NAMES: Record<Ticker, string> = {
  AAPL: "Apple",
  NVDA: "Nvidia",
  MSFT: "Microsoft",
  AMZN: "Amazon",
  GOOGL: "Alphabet",
  META: "Meta",
  TSLA: "Tesla",
  JPM: "JPMorgan",
};

export const SECTOR: Record<Ticker, string> = {
  AAPL: "Tech",
  NVDA: "Semis",
  MSFT: "Tech",
  AMZN: "Consumer",
  GOOGL: "Comm",
  META: "Comm",
  TSLA: "Consumer",
  JPM: "Financials",
};

/** Encode a ticker as bytes32 (right-padded hex) — matches the on-chain key. */
export function toBytes32(ticker: string): `0x${string}` {
  const hex = Buffer.from(ticker, "utf8").toString("hex");
  return ("0x" + hex.padEnd(64, "0")) as `0x${string}`;
}
