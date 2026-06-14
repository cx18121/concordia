import { isTicker, toBytes32 } from "./universe.js";

/**
 * The castVote seam. A bot's submitted allocation is validated and routed to Governance.castVote
 * — the exact same on-chain path a human uses. Vote-only: this never touches deposits/withdrawals.
 */

export interface VoteInput {
  asset: string;     // ticker, e.g. "mNVDA"
  weightBps: number; // share of the member's power on this asset
}

export interface OnchainAlloc {
  asset: `0x${string}`;
  weightBps: number;
}

export class VoteValidationError extends Error {}

/** Validate + normalize a submitted allocation into the on-chain IGovernance.Alloc[] shape. */
export function toAllocations(votes: VoteInput[]): OnchainAlloc[] {
  if (!Array.isArray(votes) || votes.length === 0)
    throw new VoteValidationError("allocations must be a non-empty array");
  if (votes.length > 8)
    throw new VoteValidationError("at most 8 assets per vote");

  const seen = new Set<string>();
  let sum = 0;
  const out: OnchainAlloc[] = [];

  for (const v of votes) {
    if (!v || typeof v.asset !== "string" || !isTicker(v.asset))
      throw new VoteValidationError(`unknown asset: ${v?.asset}`);
    if (seen.has(v.asset))
      throw new VoteValidationError(`duplicate asset: ${v.asset}`);
    if (!Number.isInteger(v.weightBps) || v.weightBps <= 0 || v.weightBps > 10000)
      throw new VoteValidationError(`weightBps must be an integer in 1..10000 (got ${v.weightBps} for ${v.asset})`);
    seen.add(v.asset);
    sum += v.weightBps;
    out.push({ asset: toBytes32(v.asset), weightBps: v.weightBps });
  }

  if (sum !== 10000)
    throw new VoteValidationError(`weights must sum to 10000 bps (got ${sum})`);

  return out;
}

export interface GovernanceAdapter {
  /** Submit a vote for `wallet`. Returns a tx hash (or a sim id offline). */
  castVote(wallet: `0x${string}`, allocs: OnchainAlloc[]): Promise<{ txHash: string }>;
}

/** In-memory adapter — records the latest vote per wallet without touching a chain. */
export class LocalGovernance implements GovernanceAdapter {
  latest = new Map<string, OnchainAlloc[]>();
  async castVote(wallet: `0x${string}`, allocs: OnchainAlloc[]) {
    this.latest.set(wallet, allocs);
    const txHash = "0xsim" + Math.random().toString(16).slice(2, 10);
    return { txHash };
  }
}

/** Raised when a vote arrives while the on-chain cycle isn't OPEN (maps to HTTP 409). */
export class VoteCycleError extends Error {}

/**
 * On-chain adapter — routes to the real Governance.castVote on Base Sepolia via the bot's signer
 * (@concordia/shared, the same SDK the web's Live mode uses). The contract requires the caller to
 * be a verified, deposited member and the cycle to be OPEN; we pre-check the phase so a closed
 * cycle returns a clear 409 instead of a raw revert. The signer is owned by the server (set via
 * BOT_SIGNER_PK) — Alpaca-style custodial: a key can vote, never withdraw.
 */
export class OnChainGovernance implements GovernanceAdapter {
  async castVote(_wallet: `0x${string}`, allocs: OnchainAlloc[]): Promise<{ txHash: string }> {
    const { realCycle, castVoteOnchain } = await import("./chain.js");
    const c = await realCycle();
    if (!c.isOpen) {
      throw new VoteCycleError(`on-chain cycle ${c.cycle} is ${c.phase}, not OPEN — try again when it opens`);
    }
    const txHash = await castVoteOnchain(allocs as { asset: `0x${string}`; weightBps: number }[]);
    return { txHash };
  }
}
