export type CycleState = "IDLE" | "OPEN" | "LOCKED";
export const CYCLE_STATE = ["IDLE", "OPEN", "LOCKED"] as const satisfies readonly CycleState[];

export interface Cycle {
  id: bigint;
  state: CycleState;
}

/** Human-friendly pick: a ticker and the % of your voting power (0–100). */
export interface Pick {
  ticker: string;
  pct: number;
}

/** On-chain allocation unit — matches Solidity `struct Alloc { bytes32 asset; uint16 weightBps; }`. */
export interface Alloc {
  asset: `0x${string}`;
  weightBps: number;
}
