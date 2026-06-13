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

| | `cre/my-workflow/` (CRE workflow) | `scripts/run.ts` (heartbeat) |
|---|---|---|
| Role | **the headline demo engine** (Chainlink prize) | no-Chainlink fallback + Railway hosting (ISSUES #13) |
| Trigger | HTTP "tick" → advance one state-step (`simulate --listen`) | infinite timed loop (90s vote / 210s hold) |
| Writes | DON report → KeystoneForwarder → `onReport` | frozen `onlyKeeper` fns, **directly** via viem |
| Mode | replay (sim); live = price-posting only | replay + live |

**They are interchangeable and never run at once** — both read `Governance.state()` as the source of
truth and advance `IDLE→OPEN→LOCKED→IDLE` identically. CRE is the demo; the heartbeat is break-glass.

The CRE workflow is **HTTP-triggered**: `cre workflow simulate --listen` keeps the simulator alive
and runs the workflow on each request to `http://localhost:2000/trigger`. So a trivial external "tick"
drives the whole cycle — a `curl` loop for always-on, or a button on stage ("advance the fund" →
Chainlink visibly posts prices + resolves scores). `--broadcast` writes **real testnet txs** with no
deployment (organizer-confirmed; CRE CLI ≥ v1.19). Cron-in-`simulate` is one-shot, so we don't use it;
a DON deploy would add `cron.trigger({schedule})` → the same handler.

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
# CRE workflow (headline demo) — compile to WASM (no auth) / run listening for ticks
cd cre && cre workflow build my-workflow --target staging-settings
cre login                                   # one-time; CRE account (ISSUES #5)
cre workflow simulate my-workflow --target staging-settings --listen --broadcast
#   then drive it with ticks (always-on):  while true; do curl -s -XPOST localhost:2000/trigger -d '{}'; sleep 90; done
#   …or POST once per phase from a stage button. --broadcast writes real Base Sepolia txs.

# Heartbeat (no-Chainlink fallback) — needs deployed contracts + KEEPER_KEY; see .env.example
cp .env.example .env                        # fill KEEPER_KEY, MODE, POOL_ASSETS
bun run start
```

## Verified (2026-06-13)

- `bun test` — **21 pass** (resolve intent, EWMA smoothing, credit split, fixture math, bytes32
  round-trip, the DON-report wire format). `cd cre/my-workflow && bun test` — **3 pass**, incl. an
  assertion that the registered trigger is genuinely `http-trigger@1.0.0-alpha`.
- `cre workflow build` — **compiles to a valid WASM binary** with CRE CLI v1.20.0 (the whole graph:
  core + `@chf/shared` + bundled fixture + viem encoders + CRE SDK).
- `fixtures/replay.json` — real Yahoo data, 13 weeks Q1 2024, 18 tickers + S&P (NVDA +84% vs S&P +12%).

**Not yet runnable here** (honest state): `cre workflow simulate --listen` needs `cre login` (CRE
account, ISSUES #5) and `--broadcast` needs deployed receiver contracts + a funded keeper wallet
(`CRE_ETH_PRIVATE_KEY`). No *deploy/activate* needed (organizer-confirmed). The heartbeat's full cycle
likewise needs A+B deployed (addresses in `shared/src/addresses.ts`).

## What workstream A must add (see ISSUES #C1 / #C2)

The keeper needs two things the frozen interfaces don't yet expose:
- **Vote-readback views** on Governance: `getVoters()` + `allocOf(member)` — CRE can't recompute
  per-member accuracy without them.
- **`onReport` receiver path** on Oracle / Governance / Executor for the CRE write path (wire format
  in `src/core/encode.ts`). The heartbeat uses the direct `onlyKeeper` fns and needs neither.
