import { describe, expect, test } from "bun:test";
import { decodeAbiParameters, parseAbiParameters } from "viem";
import { tickerToBytes32 } from "@chf/shared";
import {
  encodePricesReport,
  encodeLifecycleReport,
  encodeResolveReport,
  encodeRepegReport,
  KeeperAction,
} from "../src/core/encode.ts";

// Why these matter: these payloads are the wire contract between the CRE keeper (writes) and
// workstream A's receivers (decode in onReport). If the encoding drifts from what the contract
// abi.decode()s, every CRE write reverts on-chain. We pin it by decoding back to the exact tuple
// A must read. (The Bun heartbeat bypasses this path and calls the fns directly — see run.ts.)

describe("DON-report wire format", () => {
  test("prices report → (bytes32[] assets, uint256[] pricesE8, uint256 spE8)", () => {
    const payload = encodePricesReport({ NVDA: 9036000000n, AAPL: 17072000000n }, 525435000000n);
    const [assets, prices, sp] = decodeAbiParameters(parseAbiParameters("bytes32[], uint256[], uint256"), payload);
    expect(assets).toEqual([tickerToBytes32("NVDA"), tickerToBytes32("AAPL")]);
    expect(prices).toEqual([9036000000n, 17072000000n]);
    expect(sp).toBe(525435000000n);
  });

  test("lifecycle report → (uint8 action, bytes) with the right discriminator + empty data", () => {
    for (const action of [KeeperAction.OPEN, KeeperAction.LOCK] as const) {
      const [a, data] = decodeAbiParameters(parseAbiParameters("uint8, bytes"), encodeLifecycleReport(action));
      expect(a).toBe(action);
      expect(data).toBe("0x");
    }
  });

  test("resolve report → (uint8 RESOLVE, bytes) wrapping (address[], int256[], uint256[])", () => {
    const out = {
      members: ["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222"] as `0x${string}`[],
      newAccuracyE4: [8000, -700], //  signed: a winner and a loser
      creditWeightBps: [10000, 0],
    };
    const [action, inner] = decodeAbiParameters(parseAbiParameters("uint8, bytes"), encodeResolveReport(out));
    expect(action).toBe(KeeperAction.RESOLVE);
    const [members, acc, credit] = decodeAbiParameters(parseAbiParameters("address[], int256[], uint256[]"), inner as `0x${string}`);
    expect((members as readonly string[]).map((m) => m.toLowerCase())).toEqual(out.members.map((m) => m.toLowerCase()));
    expect(acc).toEqual([8000n, -700n]); //   int256 preserves the negative accuracy
    expect(credit).toEqual([10000n, 0n]);
  });

  test("repeg report → (bytes32 asset, uint256 targetPriceE8)", () => {
    const [asset, target] = decodeAbiParameters(parseAbiParameters("bytes32, uint256"), encodeRepegReport("NVDA", 9036000000n));
    expect(asset).toBe(tickerToBytes32("NVDA"));
    expect(target).toBe(9036000000n);
  });
});
