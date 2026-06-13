# Roadmap & Team Todo

**Goal:** an **always-on live app** judges can use themselves, plus the pitch on top of it. The fund runs continuous fast cycles (every ~5–10 min, agents voting automatically, real Uniswap swaps on Base Sepolia), so the leaderboard is always moving and a judge's own vote resolves *within their visit*. The pitch is then: Act 1 = the app's accumulated history (small-skilled agent has overtaken big-mediocre one); Act 2 = join it live.

**Judge flow (the bar to hit):** email login → gas handled invisibly → "get demo USDC" button → World ID verify → deposit → vote → watch the cycle resolve → accuracy score appears → claim. No faucets, no wallet extensions, no help from us. Landing page shows live state (leaderboard, portfolio, agent theses) without login.

How to use this file: check things off as they land. If you hit a blocker or an unanswered question, add it to `ISSUES.md` instead of stalling. Design detail lives in `DESIGN.md` / `CONTRACTS.md` — this is just who-does-what and in what order.

---

## 🚨 Urgent — time-sensitive, do before anything else

Most research questions are now answered (see `ISSUES.md` Resolved). What's left is people-dependent. In priority order:

- [x] **Freeze the interfaces** — `contracts/src/interfaces/` has `IPriceOracle`, `IFundVault`, `IGovernance`, `IUniswapExecutor` (from CONTRACTS.md). Every workstream imports these NOW; change only by team agreement.
- [x] **Foundry installed + contracts initialized** from v4-template — compiles green (interfaces + template). Deps are gitignored; restore with `contracts/setup.sh`.

---

## Phase 0 — Setup & unblockers (everyone, first ~2 hours)

These unblock everything else. Do them first, together.

- [x] Monorepo scaffolded: `contracts/` (Foundry v4-template, compiles), `keeper/` + `agents/` (stubs), `web/` (Next.js), `shared/` (@concordia/shared SDK)
- [x] **Solidity interfaces frozen** (`IPriceOracle`, `IFundVault`, `IGovernance`, `IUniswapExecutor` in `contracts/src/interfaces/`) — the contract between workstreams; change only by team agreement + note in ISSUES.md. *(ABIs generate at `forge build` after init.)*
- [ ] Accounts & keys:
  - [ ] Chainlink CRE account + **request deployment access NOW** (lead time; local simulation is the fallback)
  - [ ] World developer portal: `app_id` + action created (one for verify, one for agent linking)
  - [ ] Dynamic environment ID created, test login works
  - [ ] Install **Bun ≥1.2.21** (the CRE TS SDK runs on Bun, not Node) + the CRE CLI
  - [ ] Price API needs **no key** — Yahoo Finance v8 (ISSUES #1). Pull the 12-week historical fixture once and commit it (one URL/ticker, S&P = `%5EGSPC`).
  - [ ] **Contract deploy creds** (unblocks deploying B's execution stack + all contracts, ISSUES #17): `BASE_SEPOLIA_RPC_URL` (Alchemy/Coinbase), a funded deployer private key, `ETHERSCAN_API_KEY` (Basescan, for `--verify`). `foundry.toml` already reads these; then `forge script script/04_DeployExecution.s.sol --tc DeployExecutionScript --rpc-url base_sepolia --private-key $PK --broadcast --verify` and paste the logged addresses into `shared/src/addresses.ts`.
- [ ] Base Sepolia ETH in every dev wallet (Coinbase/Alchemy faucets) + a funded backend "drip" wallet for judge onboarding (ISSUES #11)
- [x] Deploy **mock USDC** with a public `mint()` (decided, ISSUES #2) — doubles as the "get demo USDC" button (`src/mocks/MockERC20.sol`, configurable decimals)

---

## Workstreams (run concurrently after Phase 0)

Each workstream builds against the frozen interfaces + stubs, so nobody waits on anybody until integration.

### A — Core contracts  *(owner: ____)*
PriceOracle, FundVault, Governance. Build vault with **synthetic positions first** (record weights, value at oracle price) so the whole fund logic is testable before Uniswap lands; swap in B's executor at integration.

- [x] PriceOracle: `setPrices` (onlyKeeper) + views, tests
- [x] FundVault: ERC-4626 deposit/redeem at NAV, `verified` gate, withdraw queue at boundary
- [x] FundVault: `totalAssets()` NAV from oracle prices (synthetic positions)
- [x] FundVault: `settle()` — HWM gate, reward pool from own NAV, `rewardCredit`, `claimRewards`
- [x] Governance: members, power snapshot (`openCycle`), `castVote`, state machine
- [x] Governance: `selectBasket` — proportional + cap + dust floor + renormalize, empty-cycle guards
- [x] Governance: `lockCycle` / `resolveCycle` wiring to vault
- [x] Foundry tests: full cycle on a local fork with a scripted keeper (no CRE yet) — `test/Cycle.t.sol` (synthetic positions; swaps in B's executor at integration)

### B — Uniswap execution layer  *(owner: ____)*  ⚠️ riskiest — start immediately
Standalone `UniswapExecutor` module + the pools. Test against a stub vault; A integrates it behind `executeBasket`/`closePositions`.

- [x] Mock stock ERC-20s (~8 tickers is plenty for the demo) with mint rights — `MockStock` (configurable decimals; also serves as mock USDC at 6dp)
- [x] **KYCHook (`beforeSwap` allowlist) deployed via HookMiner/CREATE2 — do this first, it blocks everything** — mined `BEFORE_SWAP_FLAG`; allowlists the executor
- [x] Create v4 pools (mockX/USDC) with hook attached, seed liquidity at realistic prices — deploy script stands up 18 pools seeded ~100k each at oracle prices (verified in sim)
- [x] `UniswapExecutor`: swap USDC→token and token→USDC — **direct** `PoolManager.unlock`→`swap` (not Universal Router; see ISSUES #16), tests pass
- [x] Re-peg helper: small swap to move pool price to a target (keeper calls this) — `repeg()`, price-limited; lands within 0.1% of target in tests
- [ ] Deployed + verified on Base Sepolia, addresses committed to `shared/src/addresses.ts` — script ready + sim-verified; **blocked on RPC/key creds** (ISSUES #17)

### C — Keeper (Chainlink CRE)  *(owner: ____)*
The off-chain brain. Develop against an anvil fork + frozen ABIs; doesn't need A finished. **Runs on Bun ≥1.2.21** (CRE TS SDK requirement) — keep it its own package, separate from the Node toolchain.

- [x] CRE workflow scaffold from `cre-templates` (cron trigger) — `keeper/cre/`, **compiles to WASM** (`cre workflow build`, CLI v1.20). `simulate` now needs `cre login` (ISSUES #5a).
- [x] **Price source behind an interface** — `ReplayFixtureSource` (real 2024 weeks, loops) + `LiveAPISource` (Yahoo), selected by config. Demo vs production is a config flag.
- [x] Job 1: fetch stock + S&P prices from price source → `Oracle.setPrices`
- [x] Job 2: pool re-peg toward the posted oracle price (heartbeat: direct `executor.repeg`; workflow: report). Needs B's executor deployed to exercise on testnet.
- [x] Job 3: resolve compute — read votes + prices on-chain, compute per-member EWMA accuracy + creditWeightBps → `Governance.resolveCycle` (uses Governance vote-readback views `getVoters()`/`allocOf(address)`, ISSUES #C1 — DONE)
- [x] Lifecycle triggers: open → lock → resolve on the cycle schedule
- [x] **Always-on mode:** `scripts/run.ts` loops cycles continuously, stepping the historical series on repeat — the live app's heartbeat. On-chain `state()` is the source of truth, so it resumes at the right *phase* after a restart (a mid-phase restart advances immediately rather than waiting out the remaining window — fine for the supervised demo).
- [x] Same logic exposed as a plain script too — the heartbeat *is* that script (shared `src/core/`); Railway hosting fallback (ISSUES #13)
- [ ] Keeper deployed somewhere persistent (Railway/Fly/CRE — see ISSUES #13) and survives restarts

### D — Frontend + identity  *(owner: ____)*
Next.js + Dynamic + World ID. Start on mocked data; wire real ABIs as A/B land. `explainers/forum-prototype.html` is the visual reference for the leaderboard/feed look.

- [ ] Dynamic login → embedded wallet, Base Sepolia network config
- [ ] **Judge onboarding, zero friction:** gas sponsorship or auto-drip on signup (ISSUES #11) + "get demo USDC" mint button — no faucet hunting
- [ ] **Public read-only landing:** live leaderboard, portfolio, current cycle state, agent theses — visible without login
- [ ] **Cycle countdown UI:** "voting closes in 1:32 / next cycle opens in 3:10" — a judge always knows what's happening and what to do next
- [ ] **Demo-mode badge:** "🕐 DEMO — replaying week of Feb 12, 2024 at ~2000× speed" — honesty as a feature; the simulation is displayed, never hidden
- [ ] World ID: IDKit widget (request `selfieCheckLegacy`, `allow_legacy_proofs: true` — NOT the default `orb` level) → **REST verify** at `POST developer.world.org/api/v4/verify/{rp_id}` in a Next.js API route → backend marks wallet verified in Vault (ISSUES #3, #10)
- [ ] Deposit / withdraw flow (incl. "queued until next cycle" state)
- [ ] Vote screen: allocation sliders across the universe, power display, submit
- [ ] Portfolio page: current basket, NAV, performance vs S&P
- [ ] Leaderboard: accuracy, cycles, rank (reads Reputation views)
- [ ] Rewards: claimable balance + claim button
- [ ] Agent delegation flow (Dynamic server wallet + AgentKit link) — thin version is fine
- [ ] Stretch: **BYO-agent HTTP API** — 4 Next.js routes (`/api/agent/cycle|universe|me|vote`) over `@concordia/shared`, Bearer-key auth mapping to a Dynamic server wallet (see `agent-integration.md` Model B). Cheap because Next.js + server wallets already exist; build after the core human flow works.
- [ ] Stretch: forum (pitch feed with live P&L badges — see prototype). P&L is measured vs oracle prices, so it works identically in replay mode. Display **market-time**, not wall-time ("posted 2 cycles ago ≈ 2 market-weeks"), and agents' theses auto-populate the feed each cycle.

### E — Agents + replay  *(owner: ____ — can double with C)*
The 6 demo agents and the 12-week replay that seeds the leaderboard. Reuses C's resolve logic. Agents connect via `@concordia/shared` (Model A in `agent-integration.md`) — wallet + read + `castVote`, same path a human uses.

- [ ] 6 deterministic strategies (momentum, value, mean-rev, sector, low-vol, contrarian) over the historical price series
- [ ] Historical data: 12 weeks of real prices for the universe + S&P (committed as fixture; loops in always-on mode)
- [ ] LLM thesis layer (one short rationale per vote; cache outputs so the app never waits on an API)
- [ ] Agents vote automatically every cycle in always-on mode (they're the app's life — judges should always see fresh activity)
- [ ] Seed script: fund agent wallets, deposits (10k/6k/4k/3k/2k/1k), run enough cycles that the leaderboard tells the story (small-skilled > big-mediocre) — **tune the window/strategies until it does**

---

## Phase 2 — Integration milestones (in order)

- [x] **M1 — Full cycle on local fork**, scripted: deposit → open → vote → lock (real swaps) → price move → resolve → claim. No UI. — `test/Integration.t.sol` runs it through the real `UniswapExecutor`+KYCHook+v4 pools; `script/DeployIntegrated.s.sol` is the unified A↔B deploy (shared USDC + tokens).
- [ ] **M2 — Same on Base Sepolia** with the CRE workflow (simulated or deployed) driving it.
- [ ] **M3 — Frontend drives the human flow** end-to-end on testnet: login → verify → deposit → vote → see resolution.
- [ ] **M4 — Always-on:** web app deployed (Vercel), keeper hosted + looping cycles continuously, agents voting every cycle, leaderboard differentiated and moving on its own.

## Phase 3 — Demo & submission

- [ ] **Judge self-serve test:** a teammate with a fresh account completes the full judge flow (login → verify → demo USDC → deposit → vote → resolve → claim) **unassisted, in under 10 minutes**. Fix whatever they trip on; repeat until clean.
- [ ] Leave the app running overnight — it must survive unattended (keeper restarts, price series loops, no stuck cycles)
- [ ] Rehearse the pitch ≥3 times on top of the live app, including one cold run
- [ ] Record demo video (≤3 min) + architecture diagram (we have the flowchart HTML)
- [ ] Sponsor submission checks:
  - [ ] Chainlink: CRE workflow simulation/deployment shown; Chainlink causes an on-chain state change ✓ (prices + resolve)
  - [ ] World: proof verification happens in backend or contract (not just widget); clear "what breaks without it" answer (sybil-resistant voting)
  - [ ] Dynamic: app deployed + usable by judges; server-wallet agent flow shown
  - [ ] Uniswap (if submitting): tx IDs of real swaps, public repo, feedback form
- [ ] ETHGlobal project page + public repo + demo link submitted **before the deadline**
- [ ] Pitch: lead with the money-shot table (small-skilled beats big-mediocre)

---

## Dependency map

```
Phase 0 (interfaces frozen) ──▶ A, B, C, D, E all start in parallel
A (core contracts) ◀── integrates B's executor     (A testable solo via synthetic positions)
C (keeper)         ◀── needs A+B deployed for testnet runs (local fork until then)
D (frontend)       ◀── needs ABIs (frozen day 1), real addresses at M2
E (replay)         ◀── reuses C's resolve logic; needs A+B deployed
Critical path: B (hook mining + swaps) → M1 → M2 → M4
```

**Definition of done for the demo path:** (1) the app has run unattended for hours with cycles resolving cleanly, and (2) a stranger with a fresh account can complete the full judge flow on the live URL without help.
