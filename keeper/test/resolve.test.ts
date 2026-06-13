import { describe, expect, test } from "bun:test";
import { computeResolve } from "../src/core/resolve.ts";
import { ewma } from "@chf/shared";

// Why these matter: resolve is the one place the keeper turns on-chain votes + prices into the
// scores that drive future voting power and the reward split. If this math drifts, a skilled
// voter's edge silently disappears (the whole pitch) — so we pin the intent, not just the shape.

describe("computeResolve", () => {
  test("rewards the voter who backed the cycle's alpha, penalizes the one who didn't", () => {
    // NVDA beat the market (+10% vs S&P +2%); XOM lagged (−5%). Two voters, opposite bets.
    const out = computeResolve({
      voters: ["0xWinner", "0xLoser"],
      allocsByVoter: {
        "0xWinner": [{ asset: "NVDA", weightBps: 10000 }],
        "0xLoser": [{ asset: "XOM", weightBps: 10000 }],
      },
      oldAccE4ByVoter: { "0xWinner": 0, "0xLoser": 0 },
      returnByTicker: { NVDA: 0.1, XOM: -0.05 },
      spReturn: 0.02,
    });

    expect(out.members).toEqual(["0xWinner", "0xLoser"]);
    // Winner's excess = +0.10 − 0.02 = +0.08 → positive accuracy; loser's = −0.07 → negative.
    expect(out.newAccuracyE4[0]).toBeGreaterThan(0);
    expect(out.newAccuracyE4[1]).toBeLessThan(0);
    // All positive credit goes to the winner; loser earns nothing from the pool.
    expect(out.creditWeightBps).toEqual([10000, 0]);
  });

  test("newAccuracy is EWMA of prior and this cycle's excess (smoothing, not replacement)", () => {
    const out = computeResolve({
      voters: ["0xA"],
      allocsByVoter: { "0xA": [{ asset: "AAPL", weightBps: 10000 }] },
      oldAccE4ByVoter: { "0xA": 5000 }, //   prior accuracy = +0.50
      returnByTicker: { AAPL: 0.02 },
      spReturn: 0.02, //                     this cycle's excess = 0
      alphaBps: 2500,
    });
    // EWMA(0.50, 0.00, α=0.25) = 0.375 → 3750 E4. One flat cycle nudges, doesn't erase, the prior.
    expect(out.newAccuracyE4[0]).toBe(Math.round(ewma(0.5, 0, 2500) * 1e4));
    expect(out.newAccuracyE4[0]).toBe(3750);
  });

  test("split picks: credit is pro-rata to each member's positive excess", () => {
    // A backs a strong winner, B backs a mild winner. Both positive → both earn, A more.
    const out = computeResolve({
      voters: ["0xA", "0xB"],
      allocsByVoter: {
        "0xA": [{ asset: "NVDA", weightBps: 10000 }], //  excess +0.08
        "0xB": [{ asset: "MSFT", weightBps: 10000 }], //  excess +0.02
      },
      oldAccE4ByVoter: {},
      returnByTicker: { NVDA: 0.1, MSFT: 0.04 },
      spReturn: 0.02,
    });
    // 0.08 : 0.02 = 8000 : 2000 bps.
    expect(out.creditWeightBps).toEqual([8000, 2000]);
  });

  test("empty cycle (no voters) returns empty arrays — contract takes the empty-cycle path", () => {
    const out = computeResolve({
      voters: [],
      allocsByVoter: {},
      oldAccE4ByVoter: {},
      returnByTicker: {},
      spReturn: 0,
    });
    expect(out).toEqual({ members: [], newAccuracyE4: [], creditWeightBps: [] });
  });
});
