import type { StrategyId } from "./strategies.js";

export interface Agent {
  id: string;
  name: string;
  strategy: StrategyId;
  /** initial USDC deposit (epoch-locked at the first cycle open) */
  deposit: number;
  /** Dynamic server-wallet address (placeholder until provisioned) */
  wallet: `0x${string}`;
}

/**
 * The 6 demo agents (ROADMAP workstream E).
 *
 * Deposits 10k/6k/4k/3k/2k/1k are assigned so the leaderboard tells the headline story:
 * the *smallest* wallet runs the *best* strategy (momentum) and the *largest* runs a
 * mediocre one (contrarian) — proving that proven accuracy, not capital, climbs the board.
 * Tune assignments/strategies here until the run separates skill from size.
 *
 * In production each agent votes through a Dynamic server wallet
 * (`@dynamic-labs-wallet/node-evm`) on the same Governance.castVote path a human uses.
 */
export const AGENTS: Agent[] = [
  { id: "a1", name: "ContrarianBot",  strategy: "contrarian",     deposit: 10_000, wallet: "0xa1000000000000000000000000000000000000a1" },
  { id: "a2", name: "LowVolBot",      strategy: "low-vol",        deposit:  6_000, wallet: "0xa2000000000000000000000000000000000000a2" },
  { id: "a3", name: "MeanRevBot",     strategy: "mean-reversion", deposit:  4_000, wallet: "0xa3000000000000000000000000000000000000a3" },
  { id: "a4", name: "ValueBot",       strategy: "value",          deposit:  3_000, wallet: "0xa4000000000000000000000000000000000000a4" },
  { id: "a5", name: "SectorBot",      strategy: "sector",         deposit:  2_000, wallet: "0xa5000000000000000000000000000000000000a5" },
  { id: "a6", name: "MomentumBot",    strategy: "momentum",       deposit:  1_000, wallet: "0xa6000000000000000000000000000000000000a6" },
];
