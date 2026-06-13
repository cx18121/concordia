# keeper — Chainlink CRE workflow + always-on heartbeat

The off-chain brain (workstream C in `../docs/ROADMAP.md`). One workflow, three jobs per cycle:

1. **Prices** — fetch stock + S&P prices → `PriceOracle.setPrices()`
2. **Re-peg** — small swaps to keep each Uniswap pool ≈ oracle price (CRE plays the arbitrageur)
3. **Lifecycle + resolve** — `openCycle` → `lockCycle` → `resolveCycle` (per-member EWMA accuracy +
   reward credit weights computed off-chain, posted on-chain)

Price source is pluggable: **ReplayFixtureSource** (demo — real 2024 weekly closes, looped) vs
**LiveAPISource** (Yahoo). The contract owns ALL money math; the keeper only supplies
*who-gets-what-fraction* + new scores (CONTRACTS.md §6).

## Two runtimes, one core

The pure compute lives in `src/core/` (price source, resolve scoring over `@chf/shared`, E8/cycle
helpers, the DON-report wire format). Two runtimes wrap it:

| | `scripts/run.ts` (heartbeat) | `cre/my-workflow/` (CRE workflow) |
|---|---|---|
| Role | **the live app's heartbeat** + hosting fallback (Railway, ISSUES #13) | the Chainlink prize artifact |
| Trigger | infinite timed loop (90s vote / 210s hold) | DON cron, one state-step per tick |
| Writes | frozen `onlyKeeper` fns, **directly** via viem | DON report → KeystoneForwarder → `onReport` |
| Mode | replay + live | replay (sim); live = price-posting only |

Both read `Governance.state()` as the source of truth, so they advance `IDLE→OPEN→LOCKED→IDLE`
identically and resume cleanly after a restart.

## Runtime

**Bun ≥ 1.2.21, not Node** — the CRE TypeScript SDK (`@chainlink/cre-sdk`) requires it. Keep this
package out of any Node workspace tooling.

## Setup

```bash
bun install                 # keeper root (core + heartbeat + tests)
bun run build-fixture       # one-shot: pull real 2024 weekly closes → fixtures/replay.json (committed)
cd cre/my-workflow && bun install   # CRE workflow package (separate, has @chainlink/cre-sdk)
```

## Run

```bash
# Always-on heartbeat (needs deployed contracts + KEEPER_KEY; see .env.example)
cp .env.example .env        # fill KEEPER_KEY, MODE, POOL_ASSETS
bun run start

# CRE workflow — compile to WASM (no auth) / simulate (needs `cre login`)
cd cre && cre workflow build my-workflow --target staging-settings
cre login && cre workflow simulate my-workflow --target staging-settings
```

## Verified (2026-06-13)

- `bun test` — **21 pass** (resolve intent, EWMA smoothing, credit split, fixture math, bytes32
  round-trip, the DON-report wire format, config + cron wiring). `cd cre/my-workflow && bun test` — 3 pass.
- `cre workflow build` — **compiles to a valid WASM binary** with CRE CLI v1.20.0 (the whole graph:
  core + `@chf/shared` + bundled fixture + viem encoders + CRE SDK).
- `fixtures/replay.json` — real Yahoo data, 13 weeks Q1 2024, 18 tickers + S&P (NVDA +84% vs S&P +12%).

**Not yet runnable here** (honest state): `cre workflow simulate` needs `cre login` (CRE account —
see ISSUES #5; this changed from the docs' "no access needed" assumption) **and** deployed receiver
contracts. The heartbeat's full cycle needs A+B deployed (addresses in `shared/src/addresses.ts`).

## What workstream A must add (see ISSUES #C1 / #C2)

The keeper needs two things the frozen interfaces don't yet expose:
- **Vote-readback views** on Governance: `getVoters()` + `allocOf(member)` — CRE can't recompute
  per-member accuracy without them.
- **`onReport` receiver path** on Oracle / Governance / Executor for the CRE write path (wire format
  in `src/core/encode.ts`). The heartbeat uses the direct `onlyKeeper` fns and needs neither.
