# Community Hedge Fund DAO

ETHGlobal New York 2026. A community fund where members pool USDC and vote weekly on stock allocations — voting power is **50% capital deposited + 50% proven accuracy**. Money buys influence; being right earns it. Humans vote directly or delegate to AI agents, which vote through the exact same path.

**Stack:** Base Sepolia · Foundry + Uniswap v4 (real on-chain execution) · Chainlink CRE (price/accuracy keeper) · World ID + AgentKit (one human, one account) · Dynamic (wallets + agent delegation) · Next.js.

## Docs — read in this order

| File | What it is |
|---|---|
| [`docs/DESIGN.md`](docs/DESIGN.md) | Locked decisions, tunable constants, core mechanics, demo-vs-production mode |
| [`docs/CONTRACTS.md`](docs/CONTRACTS.md) | Build-ready contract spec — state, functions, call graph, on/off-chain boundary |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Workstreams + team todo. Check things off as they land. |
| [`docs/ISSUES.md`](docs/ISSUES.md) | Open questions. Add blockers here instead of stalling. |
| `CLAUDE.md` | Conventions + verified doc links for the stack (also read by Claude Code) |

Visual explainers in [`docs/explainers/`](docs/explainers/) (open in a browser): `system-design-flowchart.html` (full architecture + weekly cycle), `hedge-fund-dao-architecture.html` (component inspector), `forum-prototype.html` (forum UI mock).

## Layout

```
contracts/   Solidity (Foundry + Uniswap v4-template) — interfaces frozen in src/interfaces/
keeper/      Chainlink CRE workflow (Bun ≥1.2.21) — prices, re-peg, lifecycle, resolve
web/         Next.js app — Dynamic login, World ID, vote/portfolio/leaderboard
agents/      6 demo agents (Node/TS) — strategies + LLM theses, Dynamic server wallets
shared/      @chf/shared SDK — addresses, ABIs, typed read/vote helpers (web + agents + keeper)
docs/        Specs + ROADMAP + ISSUES + agent-integration + visual explainers
```

**Building an agent?** → [`docs/agent-integration.md`](docs/agent-integration.md) (connect + vote in ~10 lines).

## Status

Design complete; monorepo scaffolded (web app live, contracts init is the contracts-owner's first Phase 0 task — needs Foundry). Next: finish Phase 0 of [`docs/ROADMAP.md`](docs/ROADMAP.md) — freeze interfaces, keys/faucets, then five parallel workstreams.
