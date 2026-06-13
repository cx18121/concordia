// DON-report wire format. The CRE workflow writes through Chainlink's KeystoneForwarder, which
// calls `onReport(bytes metadata, bytes report)` on the receiver; `report` is the payload below,
// which the receiver decodes and acts on. (The Bun heartbeat skips all this and calls the frozen
// onlyKeeper fns directly — see scripts/run.ts.) Single-sourced here so the encoding the keeper
// writes and the encoding workstream A decodes can't drift. See docs/ISSUES.md #C2.
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { tickerToBytes32 } from "@concordia/shared";
import type { ResolveOutput } from "./resolve.js";

/** Governance receiver dispatch discriminator (first field of the lifecycle report). */
export const KeeperAction = { OPEN: 0, LOCK: 1, RESOLVE: 2 } as const;

/** Oracle receiver payload → setPrices(assets, pricesE8, spE8). */
export function encodePricesReport(pricesE8: Record<string, bigint>, spE8: bigint): `0x${string}` {
  const tickers = Object.keys(pricesE8);
  return encodeAbiParameters(parseAbiParameters("bytes32[], uint256[], uint256"), [
    tickers.map((t) => tickerToBytes32(t)),
    tickers.map((t) => pricesE8[t]),
    spE8,
  ]);
}

/** Governance receiver payload for a no-arg lifecycle step (openCycle / lockCycle). */
export function encodeLifecycleReport(action: typeof KeeperAction.OPEN | typeof KeeperAction.LOCK): `0x${string}` {
  return encodeAbiParameters(parseAbiParameters("uint8, bytes"), [action, "0x"]);
}

/** Executor receiver payload → repeg(asset, targetPriceE8). */
export function encodeRepegReport(ticker: string, targetE8: bigint): `0x${string}` {
  return encodeAbiParameters(parseAbiParameters("bytes32, uint256"), [tickerToBytes32(ticker), targetE8]);
}

/** Governance receiver payload → resolveCycle(members, newAccuracyE4, creditWeightBps). */
export function encodeResolveReport(out: ResolveOutput): `0x${string}` {
  const data = encodeAbiParameters(parseAbiParameters("address[], int256[], uint256[]"), [
    out.members as `0x${string}`[],
    out.newAccuracyE4.map((n) => BigInt(n)),
    out.creditWeightBps.map((n) => BigInt(n)),
  ]);
  return encodeAbiParameters(parseAbiParameters("uint8, bytes"), [KeeperAction.RESOLVE, data]);
}
