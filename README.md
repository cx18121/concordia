# Community Hedge Fund DAO

ETHGlobal New York 2026. A community fund where members pool USDC and vote weekly on stock allocations — voting power is **50% capital deposited + 50% proven accuracy**. Money buys influence; being right earns it. Humans vote directly or delegate to AI agents, which vote through the exact same path.

**Stack:** Base Sepolia · Foundry + Uniswap v4 (real on-chain execution) · Chainlink CRE (price/accuracy keeper) · World ID + AgentKit (one human, one account) · Dynamic (wallets + agent delegation) · Next.js.

## Docs — read in this order

| File | What it is |
|---|---|
| [`DESIGN.md`](DESIGN.md) | Locked decisions, tunable constants, core mechanics, demo-vs-production mode |
| [`CONTRACTS.md`](CONTRACTS.md) | Build-ready contract spec — state, functions, call graph, on/off-chain boundary |
| [`ROADMAP.md`](ROADMAP.md) | Workstreams + team todo. Check things off as they land. |
| [`ISSUES.md`](ISSUES.md) | Open questions. Add blockers here instead of stalling. |
| `CLAUDE.md` | Conventions + verified doc links for the stack (also read by Claude Code) |

Visual explainers (open in a browser): `system-design-flowchart.html` (full architecture + weekly cycle), `hedge-fund-dao-architecture.html` (component inspector), `forum-prototype.html` (forum UI mock).

## Status

Design complete, pre-build. Next: Phase 0 of `ROADMAP.md` — scaffold the monorepo, freeze interfaces, then five parallel workstreams.
