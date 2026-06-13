// Resolve compute — the float/loop-heavy per-member arithmetic CRE owns (CONTRACTS.md §6).
// PURE: given on-chain votes + posted prices, returns exactly the three parallel arrays
// Governance.resolveCycle(members, newAccuracyE4, creditWeightBps) expects. The contract still
// owns all MONEY math (pool size, HWM, custody); we only supply who-gets-what-fraction + scores.
import { ewma, voteWeightedExcess, creditWeights, type BackedWeight } from "@chf/shared";
import { CONSTANTS } from "@chf/shared";

export interface ResolveInput {
  /** Members who voted this cycle, in a stable order (defines the output array order). */
  voters: string[];
  /** Each voter's backed allocation (asset = ticker, weightBps; a voter's weights sum to 1e4). */
  allocsByVoter: Record<string, BackedWeight[]>;
  /** Each voter's current on-chain smoothed accuracy (signed E4) — the EWMA prior. */
  oldAccE4ByVoter: Record<string, number>;
  /** Fractional return per ticker this cycle (resolve price / lock price − 1). */
  returnByTicker: Record<string, number>;
  /** Fractional S&P return this cycle (benchNow / benchLock − 1). */
  spReturn: number;
  /** EWMA smoothing (bps). Defaults to the demo constant; pass the on-chain value if it differs. */
  alphaBps?: number;
}

export interface ResolveOutput {
  members: string[]; //          parallel arrays, voters order
  newAccuracyE4: number[]; //    signed E4, EWMA-smoothed
  creditWeightBps: number[]; //  share of positive realized-alpha credit (sums to ~1e4)
}

/** Compute the resolve payload. Returns empty arrays for an empty cycle (no voters). */
export function computeResolve(input: ResolveInput): ResolveOutput {
  const { voters, allocsByVoter, oldAccE4ByVoter, returnByTicker, spReturn } = input;
  const alphaBps = input.alphaBps ?? CONSTANTS.EWMA_ALPHA_BPS;

  // This cycle's vote-weighted excess return per member — both their cycle accuracy AND raw credit.
  const cycleExcess: Record<string, number> = {};
  for (const m of voters) {
    cycleExcess[m] = voteWeightedExcess(allocsByVoter[m] ?? [], returnByTicker, spReturn);
  }

  const credit = creditWeights(cycleExcess); // bps, pro-rata to positive excess

  const newAccuracyE4: number[] = [];
  const creditWeightBps: number[] = [];
  for (const m of voters) {
    const oldFrac = (oldAccE4ByVoter[m] ?? 0) / 1e4;
    const smoothed = ewma(oldFrac, cycleExcess[m], alphaBps);
    newAccuracyE4.push(Math.round(smoothed * 1e4));
    creditWeightBps.push(credit[m] ?? 0);
  }

  return { members: [...voters], newAccuracyE4, creditWeightBps };
}
