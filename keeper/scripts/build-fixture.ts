// One-shot: pull real 2024 weekly closes for the universe + S&P from Yahoo (via @chf/shared) and
// commit them to fixtures/replay.json. Run once at kickoff: `bun run build-fixture`.
// The committed fixture is what the always-on demo loops over — real history, not invented data.
import { weeklyCloses, UNIVERSE, FIXTURE_PERIOD1, FIXTURE_PERIOD2, yahooSymbol } from "@chf/shared";
import type { ReplayFixture, FixtureWeek } from "../src/core/fixture.ts";

const UA = { "User-Agent": "Mozilla/5.0" };
const YF = "https://query1.finance.yahoo.com/v8/finance/chart";

/** The weekly timestamp grid (unix secs) for the benchmark — used to date each fixture week. */
async function weeklyTimestamps(): Promise<number[]> {
  const url = `${YF}/${yahooSymbol("SP500")}?period1=${FIXTURE_PERIOD1}&period2=${FIXTURE_PERIOD2}&interval=1wk`;
  const json = (await (await fetch(url, { headers: UA })).json()) as any;
  return json.chart.result[0].timestamp as number[];
}

async function main() {
  console.log(`Fetching weekly closes ${new Date(FIXTURE_PERIOD1 * 1000).toISOString().slice(0, 10)} → ${new Date(FIXTURE_PERIOD2 * 1000).toISOString().slice(0, 10)} for ${UNIVERSE.length} tickers + S&P…`);

  const timestamps = await weeklyTimestamps();
  const closesByTicker: Record<string, number[]> = {};
  for (const t of UNIVERSE) {
    closesByTicker[t] = await weeklyCloses(t, FIXTURE_PERIOD1, FIXTURE_PERIOD2);
    process.stdout.write(".");
  }
  const sp = await weeklyCloses("SP500", FIXTURE_PERIOD1, FIXTURE_PERIOD2);
  console.log(" done");

  // Keep only weeks where every series has a real close (Yahoo returns null for gaps).
  const weeks: FixtureWeek[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const prices: Record<string, number> = {};
    let ok = Number.isFinite(sp[i]);
    for (const t of UNIVERSE) {
      const c = closesByTicker[t][i];
      if (!Number.isFinite(c)) { ok = false; break; }
      prices[t] = Number(c.toFixed(2));
    }
    if (!ok) continue;
    weeks.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), prices, sp: Number(sp[i].toFixed(2)) });
  }

  if (weeks.length < 2) throw new Error(`only ${weeks.length} complete weeks — fixture would be a dead leaderboard`);

  const fixture: ReplayFixture = { tickers: [...UNIVERSE], weeks };
  const out = new URL("../fixtures/replay.json", import.meta.url);
  await Bun.write(out, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`Wrote ${weeks.length} weeks (${weeks[0].date} → ${weeks.at(-1)!.date}) to fixtures/replay.json`);
}

main().catch((e) => { console.error("build-fixture failed:", e); process.exit(1); });
