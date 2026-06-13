// Pluggable price source (ROADMAP C): demo vs production is a config flag, not a fork.
//  - ReplayFixtureSource — real 2024 weekly history, looped (the demo heartbeat). Pure, no I/O.
//  - LiveAPISource       — real-time Yahoo prices via @concordia/shared (production).
// Both yield the same { pricesE8, spE8 } shape that Oracle.setPrices consumes.
import { livePrices } from "@concordia/shared";
import { type ReplayFixture, weekOf, weekToE8, toE8 } from "./fixture.js";

/** A batch of on-chain-ready prices for one cycle. */
export interface PriceSnapshot {
  pricesE8: Record<string, bigint>; // ticker -> E8 price
  spE8: bigint; //                   S&P 500, E8
  label: string; //                  human label for logs / the demo-mode badge
}

export interface PriceSource {
  readonly mode: "replay" | "live";
  /** Prices to post at the given cycle. cycleId selects the replay week (loops). */
  snapshotForCycle(cycleId: number): Promise<PriceSnapshot>;
}

/** Demo: step through committed weekly history, one cycle = one market week, looping forever. */
export class ReplayFixtureSource implements PriceSource {
  readonly mode = "replay" as const;
  constructor(private readonly fixture: ReplayFixture) {
    if (fixture.weeks.length === 0) throw new Error("replay fixture has no weeks");
  }

  async snapshotForCycle(cycleId: number): Promise<PriceSnapshot> {
    const w = weekOf(cycleId, this.fixture.weeks.length);
    const week = this.fixture.weeks[w];
    const { pricesE8, spE8 } = weekToE8(week);
    return { pricesE8, spE8, label: `replay week ${week.date} (${w + 1}/${this.fixture.weeks.length})` };
  }

  /** Total weeks in the loop — the always-on driver uses this for logging. */
  get weekCount(): number {
    return this.fixture.weeks.length;
  }
}

/** Production: fetch live prices for the universe + S&P. cycleId is ignored (always "now"). */
export class LiveAPISource implements PriceSource {
  readonly mode = "live" as const;
  constructor(private readonly tickers: readonly string[]) {}

  async snapshotForCycle(_cycleId: number): Promise<PriceSnapshot> {
    const floats = await livePrices([...this.tickers, "SP500"]);
    const pricesE8: Record<string, bigint> = {};
    for (const t of this.tickers) pricesE8[t] = toE8(floats[t]);
    return { pricesE8, spE8: toE8(floats["SP500"]), label: "live (Yahoo)" };
  }
}
