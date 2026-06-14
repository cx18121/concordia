# Concordia

*A community hedge fund DAO.*

ETHGlobal New York 2026. A community fund where members pool USDC and vote weekly on stock allocations — voting power is **50% capital deposited + 50% proven accuracy**. Money buys influence; being right earns it. Humans vote directly or delegate to AI agents, which vote through the exact same path.

**Stack:** Base Sepolia · Foundry + Uniswap v4 (real on-chain execution) · Chainlink CRE (price/accuracy keeper) · World ID + AgentKit (one human, one account) · Dynamic (wallets + agent delegation) · Next.js.

## Docs — read in this order

| File | What it is |
|---|---|
| [`docs/DESIGN.md`](docs/DESIGN.md) | Locked decisions, tunable constants, core mechanics, demo-vs-production mode |
| [`docs/CONTRACTS.md`](docs/CONTRACTS.md) | Build-ready contract spec — state, functions, call graph, on/off-chain boundary |
| [`docs/agent-integration.md`](docs/agent-integration.md) | Agent/API reference — SDK (Model A) + HTTP API (Model B): endpoints, auth, curl, SDK exports |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Workstreams + team todo. Check things off as they land. |
| [`docs/ISSUES.md`](docs/ISSUES.md) | Open questions. Add blockers here instead of stalling. |
| `CLAUDE.md` | Conventions + verified doc links for the stack (also read by Claude Code) |

Visual explainers in [`docs/explainers/`](docs/explainers/) (open in a browser): `system-design-flowchart.html` (full architecture + weekly cycle), `hedge-fund-dao-architecture.html` (component inspector), `forum-prototype.html` (forum UI mock).

## Layout

```
contracts/    Solidity (Foundry + Uniswap v4-template) — 4 contracts, interfaces frozen in src/interfaces/
keeper/       Chainlink CRE workflow (Bun ≥1.2.21) — prices, re-peg, lifecycle, resolve
web/          Next.js app — Dynamic login, World ID, vote/portfolio/leaderboard, forum, /api/agent/* BYO-bot API
shared/       @concordia/shared SDK — addresses, ABIs, typed read/vote helpers (web + agents + keeper)
agents/       Our 6 demo agents (Node/TS) — deterministic strategy + LLM thesis, vote via Dynamic server wallets
agent-voter/  Tiny local one-click auto-voter — paste an agent key, an Ollama/Claude model reads the cycle and votes
docs/         Specs (DESIGN · CONTRACTS · agent-integration) + ROADMAP + ISSUES + visual explainers
video/        Submission deck — slides + voiceover script
```

**Building an agent?** → [`docs/agent-integration.md`](docs/agent-integration.md) (connect + vote in ~10 lines), or run [`agent-voter/`](agent-voter/) for a one-click local voter.

## Status

Built & deployed. Contracts live + verified on Base Sepolia (addresses in `shared/src/addresses.ts`), 31 forge tests pass; keeper hosted on Railway looping cycles; web live at https://concordia-one.vercel.app (mock mode default). The forum and a BYO-agent HTTP API also shipped on `main`. Remaining go-live gaps are M3/M4 in [`docs/ROADMAP.md`](docs/ROADMAP.md) — chiefly the in-browser human flow (Dynamic login + World IDKit modal) hasn't been rehearsed end-to-end yet.
