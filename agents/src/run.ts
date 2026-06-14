/**
 * Always-on agent runtime (ROADMAP workstream E).
 *
 * The app's heartbeat: every cycle the 6 agents vote automatically, stepping through the
 * historical price series on repeat so the leaderboard is always moving and judges always see
 * fresh activity. Theses are precomputed/cached so a vote never waits on the LLM.
 *
 * Demo mode runs against LocalGovernance; flip the adapter to OnChainGovernance (Dynamic server
 * wallets → Governance.castVote on Base Sepolia) once contracts are deployed.
 *
 *   npm run run            # default 30s cycles, loops the fixture forever
 *   CYCLE_MS=5000 npm run run
 */
import { AGENTS } from "./agents.js";
import { STRATEGIES } from "./strategies.js";
import { WEEKS } from "./fixture.js";
import { cycleAccuracy, ewma, votingPower } from "./resolve.js";
import { getThesis } from "./thesis.js";
import { LocalGovernance, type GovernanceAdapter } from "./governance-adapter.js";

const CYCLE_MS = Number(process.env.CYCLE_MS ?? 30_000);

interface State { accuracy: number; cycles: number }

async function runCycle(
  gov: GovernanceAdapter,
  cycle: number,
  state: Record<string, State>
) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`\n[${ts}] cycle ${cycle} — agents voting`);

  for (const agent of AGENTS) {
    const pick = STRATEGIES[agent.strategy](cycle);
    await gov.castVote(agent.wallet, pick.allocations);
    const acc = cycleAccuracy(pick.allocations, cycle);
    state[agent.id]!.accuracy = ewma(state[agent.id]!.accuracy, acc);
    state[agent.id]!.cycles += 1;
    const thesis = await getThesis(agent.strategy, cycle, pick); // cached → instant
    console.log(
      `  ${agent.name.padEnd(13)} → ${(pick.allocations[0]?.ticker ?? "—").padEnd(5)} ` +
        `acc ${(state[agent.id]!.accuracy * 100).toFixed(2)}%  "${thesis.slice(0, 60)}…"`
    );
  }

  const top = votingPower(
    AGENTS.map((a) => ({
      id: a.id, capital: a.deposit,
      accuracy: state[a.id]!.accuracy, cycles: state[a.id]!.cycles,
    }))
  ).sort((a, b) => b.votingPower - a.votingPower)[0]!;
  const name = AGENTS.find((a) => a.id === top.id)!.name;
  console.log(`  ↳ leader: ${name} (VP ${(top.votingPower * 100).toFixed(1)}%)`);
}

async function main() {
  const gov = new LocalGovernance();
  const state: Record<string, State> = Object.fromEntries(
    AGENTS.map((a) => [a.id, { accuracy: 0, cycles: 0 }])
  );

  console.log(`Agent runtime up — cycle every ${CYCLE_MS / 1000}s, looping ${WEEKS}-week fixture.`);

  let cycle = 1;
  // fire the first cycle immediately, then on the interval
  await runCycle(gov, cycle, state);
  setInterval(async () => {
    cycle = (cycle % WEEKS) + 1;
    await runCycle(gov, cycle, state);
  }, CYCLE_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
