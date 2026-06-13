# keeper — Chainlink CRE workflow

The off-chain brain (workstream C in `../docs/ROADMAP.md`). One workflow, three jobs per cycle:

1. **Prices** — fetch stock + S&P prices from the price source → `PriceOracle.setPrices()`
2. **Re-peg** — small swaps to keep each Uniswap pool ≈ oracle price
3. **Lifecycle + resolve** — `openCycle` → `lockCycle` → `resolveCycle` (computes per-member EWMA accuracy + reward credit weights off-chain, posts on-chain)

Price source is pluggable: `ReplayFixtureSource` (demo — historical 2024 weeks, looped) vs `LiveAPISource` (production). Always-on mode loops cycles every N minutes — this is the live app's heartbeat.

## Runtime

**Bun ≥ 1.2.21, not Node** — the CRE TypeScript SDK (`@chainlink/cre-sdk`) requires it. Keep this package out of any Node workspace tooling.

## Scaffold (Phase 0, workstream C)

Follow the CRE getting-started for TypeScript: https://docs.chain.link/cre — start from a cron-trigger template in https://github.com/smartcontractkit/cre-templates (closest fits: `custom-data-feed`, `keeper-bot`). Simulate locally with the CRE CLI; the same logic must also run as a plain Bun script (hosting fallback, see ISSUES #13).
