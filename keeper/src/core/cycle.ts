// Cycle lifecycle helpers shared by the always-on script and the CRE workflow.
// The on-chain state machine is IDLE → OPEN → LOCKED → IDLE (CONTRACTS.md §5); the keeper is
// the only thing that advances it. These helpers keep the timing + bytes32 mapping in one place.
import { tickerToBytes32, UNIVERSE } from "@chf/shared";

export type CycleState = "IDLE" | "OPEN" | "LOCKED";
export const CYCLE_STATE = ["IDLE", "OPEN", "LOCKED"] as const;

/** Demo timing (seconds): 90s voting window, ~3.5 min hold ≈ a 5-min cycle (DESIGN §3.5, ISSUES #8). */
export interface CycleTiming {
  votingWindowSec: number;
  holdSec: number;
}
export const DEMO_TIMING: CycleTiming = { votingWindowSec: 90, holdSec: 210 };

/** Decode an on-chain `Alloc[]` (bytes32 asset) into ticker-keyed backed weights for scoring. */
export function decodeAllocs(
  allocs: readonly { asset: `0x${string}`; weightBps: number | bigint }[],
): { asset: string; weightBps: number }[] {
  return allocs.map((a) => ({ asset: bytes32ToTicker(a.asset), weightBps: Number(a.weightBps) }));
}

const TICKER_BY_BYTES32 = new Map<string, string>(
  UNIVERSE.map((t) => [tickerToBytes32(t).toLowerCase(), t]),
);

/** Reverse of `tickerToBytes32` over the known universe (left-aligned, zero-padded ascii). */
export function bytes32ToTicker(b: `0x${string}`): string {
  const known = TICKER_BY_BYTES32.get(b.toLowerCase());
  if (known) return known;
  // Fallback: strip trailing zero bytes and decode ascii (handles assets outside UNIVERSE).
  const hex = b.slice(2).replace(/(00)+$/, "");
  let out = "";
  for (let i = 0; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return out;
}
