import { SPX, type Ticker } from "./universe.js";
import { weekReturn } from "./fixture.js";
import type { Allocation } from "./strategies.js";

/**
 * Scoring logic — the same math the Chainlink CRE keeper runs at resolve (ROADMAP workstream C,
 * Job 3). Kept here too so the seed/replay can compute accuracy offline. The on-chain contract
 * still owns all *money* math; this only produces the per-member fractions CRE returns.
 *
 * DESIGN.md constants:
 */
export const EWMA_ALPHA = 0.25;
export const CONFIDENCE_CYCLES = 12;

export interface MemberScore {
  accuracyE4: number;       // EWMA-smoothed accuracy, signed, ×1e4 (on-chain scale)
  cycles: number;           // cycles participated
}

/**
 * Vote-weighted excess return vs the S&P for one cycle (paper basis: credited for what you
 * backed, even picks that lost the overall vote). Returns a fraction (e.g. 0.012 = +1.2%).
 */
export function cycleAccuracy(allocations: Allocation[], cycle: number): number {
  const spx = weekReturn(SPX, cycle);
  let acc = 0;
  for (const a of allocations) {
    const r = weekReturn(a.ticker, cycle);
    acc += (a.weightBps / 10000) * (r - spx);
  }
  return acc;
}

/** EWMA update: newAcc = α·thisCycle + (1−α)·oldAcc. */
export function ewma(oldAcc: number, thisCycle: number): number {
  return EWMA_ALPHA * thisCycle + (1 - EWMA_ALPHA) * oldAcc;
}

export function confidence(cycles: number): number {
  return Math.min(cycles / CONFIDENCE_CYCLES, 1);
}

export interface PowerInput {
  id: string;
  capital: number;
  accuracy: number; // current EWMA accuracy (fraction)
  cycles: number;
}

export interface PowerRow extends PowerInput {
  capitalShare: number;
  accuracyShare: number;
  confidence: number;
  votingPower: number; // 0..1, peer-relative
}

/**
 * Voting power snapshot (DESIGN.md §"Voting power"):
 *   VP(i) = 0.5·CapitalShare(i) + 0.5·[AccuracyShare(i)·confidence(i)]
 * Peer-relative; negatives floored to 0 in the accuracy share.
 */
export function votingPower(members: PowerInput[]): PowerRow[] {
  const capTotal = members.reduce((s, m) => s + m.capital, 0) || 1;
  const accTotal = members.reduce((s, m) => s + Math.max(m.accuracy, 0), 0) || 1;

  return members.map((m) => {
    const capitalShare = m.capital / capTotal;
    const accuracyShare = Math.max(m.accuracy, 0) / accTotal;
    const conf = confidence(m.cycles);
    const votingPower = 0.5 * capitalShare + 0.5 * accuracyShare * conf;
    return { ...m, capitalShare, accuracyShare, confidence: conf, votingPower };
  });
}
