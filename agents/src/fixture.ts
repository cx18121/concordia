import { TICKERS, SPX, type Ticker } from "./universe.js";

/**
 * 12-week historical price fixture (weekly closes), universe + S&P.
 *
 * 13 rows = week 0 (baseline) + 12 investment cycles. Values are indexed/representative
 * of a real 2024 stretch (NVDA/META leading, TSLA/GOOGL lagging) — enough dispersion that
 * skill visibly separates from luck across the run. In always-on mode the keeper's
 * `ReplayFixtureSource` steps through these rows and loops; the agents read the same series.
 *
 * To swap in real data: replace PRICES with the committed Yahoo Finance v8 pull
 * (one URL/ticker, S&P = %5EGSPC) — the shape is identical.
 */

export const WEEKS = 12;

// weekly closing prices, row[0] = baseline, rows[1..12] = cycle closes
export const PRICES: Record<Ticker | typeof SPX, number[]> = {
  // strong, persistent uptrend (momentum + sector winner)
  NVDA:  [480, 492, 505, 533, 560, 548, 588, 615, 631, 622, 668, 705, 742],
  // strong, steady (momentum + comm sector)
  META:  [380, 388, 401, 410, 432, 448, 441, 470, 484, 478, 503, 521, 540],
  // moderate grinder
  MSFT:  [400, 404, 402, 410, 415, 412, 419, 423, 415, 421, 428, 431, 437],
  // moderate, choppy (mean-rev friendly)
  AMZN:  [170, 168, 175, 172, 180, 176, 184, 181, 181, 186, 183, 190, 188],
  // value name, slow re-rate (value + financials)
  JPM:   [168, 170, 169, 173, 175, 174, 178, 181, 186, 184, 189, 193, 197],
  // range-bound, low vol
  AAPL:  [188, 186, 190, 187, 191, 189, 192, 190, 187, 191, 189, 193, 192],
  // weak, fading (contrarian trap)
  GOOGL: [155, 153, 156, 151, 154, 150, 152, 149, 154, 148, 151, 147, 150],
  // weak, high vol (mean-rev + contrarian trap)
  TSLA:  [250, 243, 251, 238, 244, 230, 239, 228, 220, 231, 222, 214, 219],

  // benchmark: blends the universe, drifts up modestly
  SPX:   [500, 503, 508, 512, 519, 521, 528, 533, 536, 540, 547, 552, 558],
};

/** Weekly return of `t` going INTO cycle `c` (1-indexed): close[c] / close[c-1] - 1. */
export function weekReturn(t: Ticker | typeof SPX, cycle: number): number {
  if (cycle < 1) return 0; // no prior week before cycle 1
  const s = PRICES[t];
  const prev = s[cycle - 1];
  const cur = s[cycle];
  if (prev === undefined || cur === undefined) throw new Error(`no price for ${t} @ cycle ${cycle}`);
  return cur / prev - 1;
}

/** Trailing return over `lookback` weeks ending at cycle `c`. Used by strategies. */
export function trailingReturn(t: Ticker, cycle: number, lookback: number): number {
  const s = PRICES[t];
  const from = Math.max(0, cycle - lookback);
  const a = s[from];
  const b = s[cycle];
  if (a === undefined || b === undefined) return 0;
  return b / a - 1;
}

/** Trailing volatility (stdev of weekly returns) over `lookback` weeks ending at cycle `c`. */
export function trailingVol(t: Ticker, cycle: number, lookback: number): number {
  const rets: number[] = [];
  for (let i = Math.max(1, cycle - lookback + 1); i <= cycle; i++) {
    rets.push(weekReturn(t, i));
  }
  if (rets.length === 0) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance);
}

/** Price of `t` at the close of `cycle`. */
export function priceAt(t: Ticker | typeof SPX, cycle: number): number {
  const p = PRICES[t][cycle];
  if (p === undefined) throw new Error(`no price for ${t} @ cycle ${cycle}`);
  return p;
}
