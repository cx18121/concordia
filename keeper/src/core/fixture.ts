// The replay fixture: real 2024 weekly closes for the universe + S&P, committed once
// (built by scripts/build-fixture.ts) and looped in always-on demo mode. Pure — no I/O at
// runtime. See docs/DESIGN.md §3.5 (demo replays real history; one fast cycle = one market week).

/** One week's snapshot of closing prices (floats, USD) + the S&P level. */
export interface FixtureWeek {
  date: string; //              ISO date of the weekly close
  prices: Record<string, number>; // ticker -> close price
  sp: number; //                S&P 500 level
}

export interface ReplayFixture {
  tickers: string[]; //         universe covered (excludes the S&P benchmark)
  weeks: FixtureWeek[]; //      chronological weekly snapshots
}

/** Scale a float USD price to the on-chain 8-decimal integer (E8). */
export const toE8 = (price: number): bigint => BigInt(Math.round(price * 1e8));

/** Fractional return between two E8 prices (0.06 = +6%). Used by resolve scoring. */
export const returnBetween = (fromE8: bigint, toE8_: bigint): number =>
  fromE8 === 0n ? 0 : Number(toE8_) / Number(fromE8) - 1;

/** Which fixture week a cycle maps to (loops forever once history is exhausted). */
export const weekOf = (cycleId: number, weekCount: number): number =>
  weekCount === 0 ? 0 : ((cycleId % weekCount) + weekCount) % weekCount;

/** One week's prices as on-chain E8 integers, ready for Oracle.setPrices. */
export function weekToE8(week: FixtureWeek): { pricesE8: Record<string, bigint>; spE8: bigint } {
  const pricesE8: Record<string, bigint> = {};
  for (const [t, p] of Object.entries(week.prices)) pricesE8[t] = toE8(p);
  return { pricesE8, spE8: toE8(week.sp) };
}
