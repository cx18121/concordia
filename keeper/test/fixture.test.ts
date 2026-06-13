import { describe, expect, test } from "bun:test";
import { toE8, returnBetween, weekOf, weekToE8, type ReplayFixture } from "../src/core/fixture.ts";
import { ReplayFixtureSource } from "../src/core/priceSource.ts";
import { bytes32ToTicker, decodeAllocs } from "../src/core/cycle.ts";
import { tickerToBytes32 } from "@concordia/shared";

const FIX: ReplayFixture = {
  tickers: ["AAPL", "NVDA"],
  weeks: [
    { date: "2024-01-05", prices: { AAPL: 181.91, NVDA: 49.52 }, sp: 4697.24 },
    { date: "2024-01-12", prices: { AAPL: 185.92, NVDA: 54.77 }, sp: 4783.83 },
  ],
};

describe("fixture math", () => {
  test("toE8 scales USD floats to 8-dp integers", () => {
    expect(toE8(181.91)).toBe(18191000000n);
    expect(toE8(4697.24)).toBe(469724000000n);
  });

  test("returnBetween is the fractional move between two E8 prices", () => {
    expect(returnBetween(toE8(100), toE8(110))).toBeCloseTo(0.1, 10);
    expect(returnBetween(0n, 100n)).toBe(0); // guard: no divide-by-zero
  });

  test("weekOf loops the history forever (one cycle = one market week)", () => {
    expect(weekOf(0, 2)).toBe(0);
    expect(weekOf(1, 2)).toBe(1);
    expect(weekOf(2, 2)).toBe(0); // wraps
    expect(weekOf(5, 2)).toBe(1);
  });

  test("weekToE8 converts a whole week to on-chain prices", () => {
    const { pricesE8, spE8 } = weekToE8(FIX.weeks[0]);
    expect(pricesE8.AAPL).toBe(18191000000n);
    expect(spE8).toBe(469724000000n);
  });
});

describe("ReplayFixtureSource", () => {
  test("steps weeks by cycle id and labels the demo week", async () => {
    const src = new ReplayFixtureSource(FIX);
    expect(src.weekCount).toBe(2);
    const s0 = await src.snapshotForCycle(0);
    expect(s0.pricesE8.NVDA).toBe(toE8(49.52));
    expect(s0.label).toContain("2024-01-05");
    const s2 = await src.snapshotForCycle(2); // wraps to week 0
    expect(s2.pricesE8.NVDA).toBe(toE8(49.52));
  });

  test("rejects an empty fixture (fail loud, not a silent dead leaderboard)", () => {
    expect(() => new ReplayFixtureSource({ tickers: [], weeks: [] })).toThrow();
  });
});

describe("bytes32 <-> ticker round-trip", () => {
  test("decodeAllocs reverses tickerToBytes32 for the on-chain vote shape", () => {
    const onchain = [
      { asset: tickerToBytes32("NVDA"), weightBps: 6000n },
      { asset: tickerToBytes32("MSFT"), weightBps: 4000 },
    ];
    expect(decodeAllocs(onchain)).toEqual([
      { asset: "NVDA", weightBps: 6000 },
      { asset: "MSFT", weightBps: 4000 },
    ]);
    expect(bytes32ToTicker(tickerToBytes32("AAPL"))).toBe("AAPL");
  });
});
