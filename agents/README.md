# agents — demo agents + strategies

The 6 demo agents (workstream E in `../docs/ROADMAP.md`): momentum, value, mean-reversion, sector-rotation, low-vol, contrarian. Each is a **deterministic strategy** (reliable, reproducible) + an **LLM thesis layer** that writes the human-readable rationale (outputs are cached — the app must never wait on an LLM API).

Agents vote every cycle in always-on mode via Dynamic server wallets (`@dynamic-labs-wallet/node-evm`), through the exact same `Governance.castVote` path a human uses. Deposits: 10k / 6k / 4k / 3k / 2k / 1k USDC — the seed script runs enough cycles that the leaderboard tells the story (small-skilled beats big-mediocre).

Historical price fixture (12 weeks, universe + S&P) lives here and is shared with the keeper's `ReplayFixtureSource`.

Runtime: Node/TypeScript.

## Run it

```bash
npm install
npm run seed        # 12-week replay → prints per-cycle activity + final leaderboard
npm run run         # always-on loop (votes every CYCLE_MS, loops the fixture)
npm run typecheck
```

`npm run seed` is the headline demo: it ends with a leaderboard where the small-capital,
high-skill agent outranks the big-capital, mediocre one — and a ✓/✗ check that the story holds.

Set `ANTHROPIC_API_KEY` to generate real LLM theses (cached to `data/thesis-cache.json`);
without it, a deterministic template fallback is used so everything runs offline.

## Layout

| File | What it is |
|---|---|
| `src/universe.ts` | tradable tickers, sectors, `bytes32` asset encoding (on-chain key) |
| `src/fixture.ts` | 12-week weekly price fixture + return/vol helpers (swap in real Yahoo data here) |
| `src/strategies.ts` | the 6 deterministic strategies → capped, normalized bps allocations |
| `src/agents.ts` | the 6 agents: strategy, deposit, server-wallet address |
| `src/resolve.ts` | accuracy (vote-weighted excess vs S&P), EWMA, confidence, voting power — mirrors the CRE keeper |
| `src/thesis.ts` | LLM thesis layer with disk cache + offline template fallback |
| `src/governance-adapter.ts` | `castVote` seam: `LocalGovernance` (sim) vs `OnChainGovernance` (Dynamic → Base Sepolia) |
| `src/seed.ts` | the 12-week replay + leaderboard (`npm run seed`) |
| `src/run.ts` | always-on voting loop (`npm run run`) |

## Going live (flip from sim to chain)

1. Deploy contracts; commit `Governance` ABI + address.
2. Provision a Dynamic server wallet per agent; fund with Base Sepolia ETH (gas) + deposit USDC.
3. Swap `LocalGovernance` → `OnChainGovernance` in `run.ts` and wire the `writeContract` call
   (the exact shape is documented in `governance-adapter.ts`).
4. Point `fixture.ts` at the committed real price series (same shape) — or have the keeper drive prices and read them back.
