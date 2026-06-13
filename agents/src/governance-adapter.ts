import { toBytes32 } from "./universe.js";
import type { Allocation } from "./strategies.js";

/**
 * The seam between agents and the chain. Agents call `castVote` exactly like a human does;
 * the adapter decides whether that hits a local simulation (for the seed/replay) or the real
 * Governance contract via a Dynamic server wallet (always-on mode on Base Sepolia).
 */
export interface GovernanceAdapter {
  castVote(wallet: `0x${string}`, allocations: Allocation[]): Promise<void>;
}

/** Convert strategy allocations into the on-chain IGovernance.Alloc[] shape. */
export function toOnchainAllocs(allocations: Allocation[]): { asset: `0x${string}`; weightBps: number }[] {
  const out = allocations.map((a) => ({ asset: toBytes32(a.ticker), weightBps: a.weightBps }));
  const sum = out.reduce((s, a) => s + a.weightBps, 0);
  if (sum !== 10000) throw new Error(`allocations must sum to 1e4, got ${sum}`);
  return out;
}

/** In-memory adapter — records votes for the seed/replay without touching a chain. */
export class LocalGovernance implements GovernanceAdapter {
  votes = new Map<string, Allocation[]>();
  async castVote(wallet: `0x${string}`, allocations: Allocation[]): Promise<void> {
    toOnchainAllocs(allocations); // validate the sum exactly as the contract would
    this.votes.set(wallet, allocations);
  }
}

/**
 * On-chain adapter — votes through Governance.castVote via a Dynamic server wallet.
 *
 * Wiring (kept as a documented stub for the hackathon; flip on once contracts deploy):
 *   import { DynamicEvmWalletClient } from "@dynamic-labs-wallet/node-evm";
 *   import { createWalletClient, http } from "viem";
 *   import { baseSepolia } from "viem/chains";
 *   import GovernanceAbi from "../abi/Governance.json";
 *
 *   await walletClient.writeContract({
 *     address: GOVERNANCE_ADDRESS,
 *     abi: GovernanceAbi,
 *     functionName: "castVote",
 *     args: [toOnchainAllocs(allocations)],
 *   });
 */
export class OnChainGovernance implements GovernanceAdapter {
  constructor(private governanceAddress: `0x${string}`) {}
  async castVote(_wallet: `0x${string}`, allocations: Allocation[]): Promise<void> {
    const allocs = toOnchainAllocs(allocations);
    throw new Error(
      `OnChainGovernance not wired yet — would call castVote(${JSON.stringify(allocs)}) ` +
        `on ${this.governanceAddress} via the agent's Dynamic server wallet.`
    );
  }
}
