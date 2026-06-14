// Pure resolve math — the keeper's per-member compute AND the replay engine use these
// (write it once). Returns are fractional (0.06 = +6%). See docs/internal/CONTRACTS.md §6, DESIGN.md §3.
import { CONSTANTS } from "./constants";

/** One member's weight (bps) on a backed asset this cycle. */
export interface BackedWeight {
  asset: string;
  weightBps: number;
}

/** Vote-weighted excess return over the benchmark: Σ weight·(assetReturn − sp).
 *  This single number is both the member's cycle accuracy AND their raw reward credit. */
export function voteWeightedExcess(
  backed: BackedWeight[],
  assetReturn: Record<string, number>,
  sp: number,
): number {
  let x = 0;
  for (const b of backed) x += (b.weightBps / 1e4) * ((assetReturn[b.asset] ?? 0) - sp);
  return x;
}

/** EWMA smoothing for accuracy: α·thisCycle + (1−α)·old. */
export function ewma(oldAcc: number, thisCycle: number, alphaBps: number = CONSTANTS.EWMA_ALPHA_BPS): number {
  const a = alphaBps / 1e4;
  return a * thisCycle + (1 - a) * oldAcc;
}

/** Split the reward pool: each member's share = positive excess / total positive excess.
 *  Input: this cycle's vote-weighted excess per member. Output: creditWeightBps (sums to 1e4). */
export function creditWeights(excessByMember: Record<string, number>): Record<string, number> {
  let total = 0;
  const pos: Record<string, number> = {};
  for (const [m, x] of Object.entries(excessByMember)) {
    const p = Math.max(x, 0);
    pos[m] = p;
    total += p;
  }
  const out: Record<string, number> = {};
  for (const [m, p] of Object.entries(pos)) out[m] = total > 0 ? Math.round((p / total) * 1e4) : 0;
  return out;
}
