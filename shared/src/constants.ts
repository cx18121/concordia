// Demo defaults for the governance-tunable constants. The CONTRACT is the source of truth
// (these are settable on-chain); this mirrors them for off-chain compute + UI display.
// Keep in sync with docs/DESIGN.md §2.
export const CONSTANTS = {
  CAPITAL_BPS: 5000, //        50% capital weight in voting power
  ACCURACY_BPS: 5000, //       50% accuracy weight
  EWMA_ALPHA_BPS: 2500, //     0.25 accuracy smoothing
  CONFIDENCE_CYCLES: 12, //    accuracy phase-in length
  POSITION_CAP_BPS: 3000, //   30% max per position
  REWARD_POOL_PCT_BPS: 2000, // 20% of alpha → reward pool
  CYCLE_MINUTES: 5, //         demo cadence
  VOTING_WINDOW_SECONDS: 90,
} as const;

// 2024 replay fixture window (unix seconds): 2024-01-01 → 2024-04-01 (13 weekly closes).
export const FIXTURE_PERIOD1 = 1704067200;
export const FIXTURE_PERIOD2 = 1711929600;
