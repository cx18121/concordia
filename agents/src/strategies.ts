import { TICKERS, SECTOR, type Ticker } from "./universe.js";
import { trailingReturn, trailingVol, weekReturn } from "./fixture.js";

/** One agent's vote: weights in bps across assets, summing to 1e4 (matches IGovernance.Alloc). */
export interface Allocation {
  ticker: Ticker;
  weightBps: number;
}

export interface StrategyPick {
  allocations: Allocation[];
  /** the assets the strategy "liked" most, in order — used by the thesis layer */
  rationale: { ticker: Ticker; score: number }[];
}

export type StrategyId =
  | "momentum"
  | "value"
  | "mean-reversion"
  | "sector"
  | "low-vol"
  | "contrarian";

const POSITION_CAP_BPS = 3000; // 30% — mirrors DESIGN.md POSITION_CAP_PCT
const TOP_K = 3; // how many names each strategy concentrates into

/**
 * Build a normalized bps allocation from raw positive scores, applying the position cap
 * and renormalizing — the same proportional+cap rule the basket selection uses on-chain.
 */
function toAllocation(scores: { ticker: Ticker; score: number }[]): StrategyPick {
  const ranked = [...scores].sort((a, b) => b.score - a.score);
  const picks = ranked.filter((s) => s.score > 0).slice(0, TOP_K);

  // fallback: if nothing scored positive, spread evenly over the top names
  const chosen = picks.length > 0 ? picks : ranked.slice(0, TOP_K).map((s) => ({ ...s, score: 1 }));

  const total = chosen.reduce((a, b) => a + b.score, 0);
  let allocations: Allocation[] = chosen.map((s) => ({
    ticker: s.ticker,
    weightBps: Math.round((s.score / total) * 10000),
  }));

  // apply position cap, then renormalize the remainder
  allocations = applyCap(allocations);

  return { allocations, rationale: ranked.slice(0, TOP_K) };
}

function applyCap(allocs: Allocation[]): Allocation[] {
  let out = allocs.map((a) => ({ ...a }));
  for (let pass = 0; pass < 4; pass++) {
    const over = out.filter((a) => a.weightBps > POSITION_CAP_BPS);
    if (over.length === 0) break;
    let excess = 0;
    for (const a of over) {
      excess += a.weightBps - POSITION_CAP_BPS;
      a.weightBps = POSITION_CAP_BPS;
    }
    const under = out.filter((a) => a.weightBps < POSITION_CAP_BPS);
    const underTotal = under.reduce((s, a) => s + a.weightBps, 0) || 1;
    for (const a of under) a.weightBps += Math.round((a.weightBps / underTotal) * excess);
  }
  // fix rounding drift so weights sum to exactly 1e4
  const sum = out.reduce((s, a) => s + a.weightBps, 0);
  if (out.length > 0 && sum !== 10000) out[0]!.weightBps += 10000 - sum;
  return out;
}

/**
 * Each strategy scores the universe at the OPEN of `cycle` using only data through the
 * previous close (cycle-1). The resulting vote resolves on `cycle`'s return.
 */
export const STRATEGIES: Record<StrategyId, (cycle: number) => StrategyPick> = {
  // chase the strongest 4-week trend
  momentum: (cycle) =>
    toAllocation(
      TICKERS.map((t) => ({ ticker: t, score: trailingReturn(t, cycle - 1, 4) }))
    ),

  // favor steady names that haven't run up — cheap-ish, positive long trend, low recent pop
  value: (cycle) =>
    toAllocation(
      TICKERS.map((t) => {
        const long = trailingReturn(t, cycle - 1, 8);
        const recent = trailingReturn(t, cycle - 1, 2);
        // reward positive long-run health, penalize recent froth
        return { ticker: t, score: long - 1.5 * recent };
      })
    ),

  // buy last week's biggest losers (expect a bounce)
  "mean-reversion": (cycle) =>
    toAllocation(
      TICKERS.map((t) => ({ ticker: t, score: -weekReturn(t, cycle - 1) }))
    ),

  // rotate into the names in the best-performing sector this month
  sector: (cycle) => {
    const sectorRet: Record<string, number> = {};
    const sectorCount: Record<string, number> = {};
    for (const t of TICKERS) {
      const r = trailingReturn(t, cycle - 1, 4);
      sectorRet[SECTOR[t]] = (sectorRet[SECTOR[t]] ?? 0) + r;
      sectorCount[SECTOR[t]] = (sectorCount[SECTOR[t]] ?? 0) + 1;
    }
    const best = Object.entries(sectorRet)
      .map(([s, r]) => ({ s, avg: r / (sectorCount[s] ?? 1) }))
      .sort((a, b) => b.avg - a.avg)[0]?.s;
    return toAllocation(
      TICKERS.map((t) => ({
        ticker: t,
        score: SECTOR[t] === best ? trailingReturn(t, cycle - 1, 4) + 0.05 : 0,
      }))
    );
  },

  // prefer the calmest names (lowest trailing vol) that are at least flat
  "low-vol": (cycle) =>
    toAllocation(
      TICKERS.map((t) => {
        const vol = trailingVol(t, cycle - 1, 6);
        const trend = trailingReturn(t, cycle - 1, 6);
        return { ticker: t, score: trend >= -0.01 ? 1 / (vol + 0.01) : 0 };
      })
    ),

  // bet against the crowd — buy the worst trailing performers
  contrarian: (cycle) =>
    toAllocation(
      TICKERS.map((t) => ({ ticker: t, score: -trailingReturn(t, cycle - 1, 4) }))
    ),
};
