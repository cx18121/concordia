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

/**
 * On-chain adapter — routes to Governance.castVote on Base Sepolia. Flip this on once contracts
 * deploy. The contract requires the caller to be a verified member; for delegated bot votes the
 * server signs with the member's Dynamic server wallet bound to the API key.
 *
 *   await walletClient.writeContract({
 *     address: GOVERNANCE_ADDRESS,
 *     abi: GovernanceAbi,
 *     functionName: "castVote",
 *     args: [allocs],
 *   });
 */
export class OnChainGovernance implements GovernanceAdapter {
  constructor(private governanceAddress: `0x${string}`) {}
  async castVote(_wallet: `0x${string}`, allocs: OnchainAlloc[]): Promise<{ txHash: string }> {
    throw new Error(
      `OnChainGovernance not wired yet — would call castVote(${JSON.stringify(allocs)}) on ${this.governanceAddress}.`
    );
  }
}
