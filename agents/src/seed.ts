/**
 * Seed / replay script (ROADMAP workstream E).
 *
 * Runs the 6 agents through the 12-week price fixture: each cycle they vote via their strategy
 * (through the same castVote path a human uses), the cycle resolves, accuracy updates (EWMA),
 * and voting power is recomputed. Prints the per-cycle activity and the final leaderboard —
 * which should show the small-skilled agent overtaking the big-mediocre one.
 *
 *   npm run seed
 */
import { AGENTS } from "./agents.js";
import { STRATEGIES } from "./strategies.js";
import { WEEKS } from "./fixture.js";
import { cycleAccuracy, ewma, votingPower } from "./resolve.js";
import { getThesis } from "./thesis.js";
import { LocalGovernance } from "./governance-adapter.js";
import { NAMES } from "./universe.js";

interface State {
  accuracy: number; // EWMA fraction
  cycles: number;
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const col = (x: number, s: string) => (x >= 0 ? green(s) : red(s));

async function main() {
  const gov = new LocalGovernance();
  const state: Record<string, State> = Object.fromEntries(
    AGENTS.map((a) => [a.id, { accuracy: 0, cycles: 0 }])
  );

  console.log(bold("\n  Community Fund DAO — 12-week agent replay\n"));
  console.log(dim("  6 agents · deposits 10k/6k/4k/3k/2k/1k · voting = 50% capital + 50% accuracy\n"));

  for (let cycle = 1; cycle <= WEEKS; cycle++) {
    console.log(bold(`\n  ── Cycle ${cycle} ` + "─".repeat(46)));

    for (const agent of AGENTS) {
      const pick = STRATEGIES[agent.strategy](cycle);
      await gov.castVote(agent.wallet, pick.allocations); // same path as a human vote
      const acc = cycleAccuracy(pick.allocations, cycle);
      state[agent.id]!.accuracy = ewma(state[agent.id]!.accuracy, acc);
      state[agent.id]!.cycles += 1;

      const top = pick.allocations[0];
      const thesis = await getThesis(agent.strategy, cycle, pick);
      console.log(
        `   ${agent.name.padEnd(13)} ${dim(agent.strategy.padEnd(15))} ` +
          `top ${cyan((top ? top.ticker : "—").padEnd(5))} ` +
          `cycleα ${col(acc, pct(acc).padStart(8))}  ${dim("EWMA " + pct(state[agent.id]!.accuracy))}`
      );
      if (cycle === WEEKS) console.log(dim(`      └ "${thesis}"`));
    }
  }

  // Final leaderboard
  const rows = votingPower(
    AGENTS.map((a) => ({
      id: a.id,
      capital: a.deposit,
      accuracy: state[a.id]!.accuracy,
      cycles: state[a.id]!.cycles,
    }))
  )
    .map((r) => {
      const agent = AGENTS.find((a) => a.id === r.id)!;
      return { ...r, name: agent.name, strategy: agent.strategy, deposit: agent.deposit };
    })
    .sort((a, b) => b.votingPower - a.votingPower);

  console.log(bold("\n\n  ══ FINAL LEADERBOARD " + "═".repeat(48)));
  console.log(
    dim(
      "   #  Agent          Strategy         Capital   Accuracy   Conf    Voting Power"
    )
  );
  rows.forEach((r, i) => {
    const rank = `${i + 1}`.padStart(2);
    const vpBar = "█".repeat(Math.round(r.votingPower * 40));
    console.log(
      `  ${rank}  ${r.name.padEnd(13)} ${dim(r.strategy.padEnd(15))} ` +
        `$${`${(r.deposit / 1000).toFixed(0)}k`.padEnd(6)} ` +
        `${col(r.accuracy, pct(r.accuracy).padStart(8))}  ` +
        `${(r.confidence * 100).toFixed(0).padStart(3)}%   ` +
        `${cyan((r.votingPower * 100).toFixed(1) + "%").padStart(6)} ${dim(vpBar)}`
    );
  });

  // The headline check
  const top = rows[0]!;
  const biggest = rows.reduce((a, b) => (a.deposit > b.deposit ? a : b));
  console.log("");
  if (top.deposit < biggest.deposit) {
    console.log(
      green(
        `  ✓ Story holds: ${top.name} ($${(top.deposit / 1000).toFixed(0)}k) leads on skill, ` +
          `above ${biggest.name} ($${(biggest.deposit / 1000).toFixed(0)}k).`
      )
    );
  } else {
    console.log(
      red(`  ✗ Capital still leads — tune strategies/window in fixture.ts until skill separates.`)
    );
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
