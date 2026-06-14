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
- [x] Accounts & keys:
  - [x] Chainlink CRE account + `cre login` — local `simulate --broadcast` is the sanctioned path (writes real testnet txs); DON deploy optional (ISSUES #5)
  - [x] World developer portal: `app_id` + action created
  - [x] Dynamic environment ID created
  - [x] Install **Bun ≥1.2.21** (the CRE TS SDK runs on Bun, not Node) + the CRE CLI
  - [x] Price API needs **no key** — Yahoo Finance v8 (ISSUES #1). 18-ticker historical fixture pulled + committed (`keeper/fixtures/replay.json`).
  - [x] **Contract deploy creds** — deployed to Base Sepolia; addresses in `shared/src/addresses.ts`.
- [ ] Base Sepolia ETH funding: the admin/keeper wallet (`0x07bEd…`) needs ~0.05–0.1 ETH for keeper gas + user-gas drips. New-user gas is auto-handled (CDP faucet via `/api/verify`, or admin-transfer fallback). *(Wallet currently runs low — top up once via the CDP faucet UI.)*
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
- [x] Create v4 pools (mockX/USDC) with hook attached, seed liquidity at realistic prices — deploy script stands up 18 pools seeded ~100k each at oracle prices
- [x] `UniswapExecutor`: swap USDC→token and token→USDC — **direct** `PoolManager.unlock`→`swap` (not Universal Router; see ISSUES #16), tests pass
- [x] Re-peg helper: small swap to move pool price to a target (keeper calls this) — `repeg()`, price-limited; lands within 0.1% of target. Keeper re-pegs all 18 in parallel (~7s).
- [x] Deployed + verified on Base Sepolia, addresses committed to `shared/src/addresses.ts`

### C — Keeper (Chainlink CRE)  *(owner: ____)*
The off-chain brain. Develop against an anvil fork + frozen ABIs; doesn't need A finished. **Runs on Bun ≥1.2.21** (CRE TS SDK requirement) — keep it its own package, separate from the Node toolchain.

- [x] CRE workflow scaffold from `cre-templates` (cron trigger) — `keeper/cre/`, **compiles to WASM**; `simulate --broadcast` writes real on-chain state (ISSUES #5).
- [x] **Price source behind an interface** — `ReplayFixtureSource` (real 2024 weeks, loops) + `LiveAPISource` (Yahoo), selected by config. Demo vs production is a config flag.
- [x] Job 1: fetch stock + S&P prices from price source → `Oracle.setPrices`
- [x] Job 2: pool re-peg toward the posted oracle price (heartbeat: direct `executor.repeg`; workflow: report).
- [x] Job 3: resolve compute — read votes + prices on-chain, compute per-member EWMA accuracy + creditWeightBps → `Governance.resolveCycle` (uses `getVoters()`/`allocOf(address)`, ISSUES #C1)
- [x] Lifecycle triggers: open → lock → resolve on the cycle schedule
- [x] **Always-on mode:** `scripts/run.ts` loops cycles continuously (~90s: 60s vote + 30s hold), stepping the historical series on repeat. On-chain `state()` is the source of truth, so it resumes at the right *phase* after a restart. Auto-tops-up its own gas from the CDP faucet when low (opt-in via CDP creds).
- [x] Same logic exposed as a plain script too — the heartbeat *is* that script (shared `src/core/`); runs on Bun (local) + Node/tsx (Railway image).
- [x] Keeper deployed persistent on **Railway** (`concordia-keeper`, Node/tsx Dockerfile) — looping cycles continuously, resumes from on-chain `state()` after restart, CDP auto-top-up live. Web also deployed → **https://concordia-one.vercel.app** (mock default). Not yet git-auto-deploy (manual `railway up` / `vercel deploy --prebuilt`).

### D — Frontend + identity  *(owner: ____)*
Next.js + Dynamic + World ID. Start on mocked data; wire real ABIs as A/B land. `explainers/forum-prototype.html` is the visual reference for the leaderboard/feed look.

- [x] Dynamic login → embedded wallet, Base Sepolia network config — `lib/auth.tsx` (live browser flow not yet rehearsed — see M3)
- [x] **Judge onboarding, zero friction:** auto gas (CDP faucet drip via `/api/verify`, admin-transfer fallback) + "get demo USDC" mint button — no faucet hunting
- [x] **Public read-only landing:** `/welcome` shows whole-fund value + stats + cycle state without login *(full leaderboard/agent-theses still behind the membership gate)*
- [ ] **Cycle countdown UI:** "voting closes in 1:32 / next cycle opens in 3:10" — works in mock; **live has no on-chain phase-end timestamp, so `secondsLeft` is 0 in live mode** (needs a `phaseStartedAt` on Governance or a keeper-published estimate)
- [ ] **Demo-mode badge:** "🕐 DEMO — replaying week of ... at ~Nx speed" honesty banner — *(the nav has a Demo/Live toggle pill, but not the replay-context banner)*
- [x] World ID: IDKit widget (`selfieCheckLegacy`, `allow_legacy_proofs: true`) → **REST verify** in a Next.js API route → **backend marks wallet verified in Vault** (`/api/verify` admin-writes `Vault.verify`; on-chain bridge verified live, ISSUES #3/#10)
- [x] Deposit flow — verified live end-to-end on testnet *(withdraw/"queued until next cycle" UI not built — off the demo path)*
- [x] Vote screen: allocation sliders across the 18-asset universe, power display, submit — verified live (castVote landed on-chain)
- [x] Portfolio page: current basket, NAV, performance vs S&P (`usePosition` wired live)
- [x] Leaderboard: accuracy, cycles, rank (`useLeaderboard` wired)
- [x] Rewards: claimable balance + claim button (`rewardCredit` + `claimRewards` wired)
- [ ] Agent delegation flow (Dynamic server wallet + AgentKit link) — **on the agents branch, not main**
- [x] Stretch: **BYO-agent HTTP API** — on main: Next.js routes `/api/agent/{keys,vote,me,cycle,universe}` over `@concordia/shared`. Mint a key, read cycle/universe/identity, cast an allocation vote over Bearer auth. The vote page mints keys, shows a live curl example, and polls `/api/agent/me` so bot votes appear in the basket. *(Key store is KV/in-memory; agent votes not yet tallied on-chain.)*
- [x] Stretch: forum — full board on main, not just a page: theses with file attachments, threaded comments, upvotes, per-ticker bull/bear voting, accuracy + voting-power badges on each byline, P&L-since-posted delta, sorted by accuracy, ticker chips deep-link to the ballot (`?add=TICKER`), agents post alongside humans, edit/delete own posts. Persisted via Upstash Redis (in-memory fallback locally). *(Badges/P&L render from demo/mock data; live on-chain reputation binding not wired, and forum writes are off-chain.)*

### E — Agents + replay  *(owner: ____ — can double with C)*
The 6 demo agents and the 12-week replay that seeds the leaderboard. Reuses C's resolve logic. Agents connect via `@concordia/shared` (Model A in `agent-integration.md`) — wallet + read + `castVote`, same path a human uses.

- [x] 6 deterministic strategies (momentum, value, mean-rev, sector, low-vol, contrarian) over the historical price series — `agents/src/strategies.ts`
- [x] Historical data: 12 weeks of prices for the universe + S&P (committed fixture; loops in always-on mode) — `agents/src/fixture.ts` *(representative values; swap in the real Yahoo pull, same shape)*
- [x] LLM thesis layer (one short rationale per vote; cached to disk + offline template fallback so the app never waits on an API) — `agents/src/thesis.ts`
- [x] Agents vote automatically every cycle in always-on mode — `agents/src/run.ts` (`npm run run`)
- [x] Seed script: deposits (10k/6k/4k/3k/2k/1k), runs the replay, prints the leaderboard — `agents/src/seed.ts` (`npm run seed`). Story holds: small-skilled SectorBot ($2k) tops big-mediocre ContrarianBot ($10k). *(Votes go through a `LocalGovernance` sim; flip to `OnChainGovernance` + Dynamic server wallets once contracts deploy — see `agents/src/governance-adapter.ts`.)*
- [x] Web Demo mode is driven by the agent engine, not hardcoded data: `agents/src/export-demo.ts` (`npm run export-demo`) emits `web/src/lib/demoData.ts` (final leaderboard + the demo cycle's real returns); on resolve the web scores the user's own vote with the same excess-vs-S&P math.

---

## Phase 2 — Integration milestones (in order)

- [x] **M1 — Full cycle on local fork**, scripted: deposit → open → vote → lock (real swaps) → price move → resolve → claim. No UI. — `test/Integration.t.sol` runs it through the real `UniswapExecutor`+KYCHook+v4 pools; `script/DeployIntegrated.s.sol` is the unified A↔B deploy (shared USDC + tokens).
- [x] **M2 — Same on Base Sepolia** with the CRE workflow driving it — keeper heartbeat drives full cycles live on Base Sepolia; CRE `simulate --broadcast` writes real on-chain state (lock/resolve verified).
- [ ] **M3 — Frontend drives the human flow** end-to-end on testnet: login → verify → deposit → vote → see resolution. **On-chain path verified headlessly (fresh wallet → verify → drip → deposit → vote landed live); the in-browser flow (Dynamic login + World IDKit modal + UI) has NOT been run end-to-end yet — this is the key remaining risk.**
- [ ] **M4 — Always-on:** web app deployed (Vercel), keeper hosted + looping cycles continuously, agents voting every cycle, leaderboard differentiated and moving on its own.

## Phase 3 — Demo & submission

- [ ] **Judge self-serve test:** a teammate with a fresh account completes the full judge flow (login → verify → demo USDC → deposit → vote → resolve → claim) **unassisted, in under 10 minutes**. Fix whatever they trip on; repeat until clean.
- [ ] Leave the app running overnight — it must survive unattended (keeper restarts, price series loops, no stuck cycles)
- [ ] Rehearse the pitch ≥3 times on top of the live app, including one cold run
- [ ] Record demo video (≤3 min) + architecture diagram (we have the flowchart HTML)
- [ ] Sponsor submission checks:
  - [x] Chainlink: CRE workflow simulation shown; Chainlink causes an on-chain state change (prices + resolve, verified live)
  - [x] World: proof verification happens in backend + contract (REST verify → `Vault.verify`, not just the widget); "what breaks without it" = sybil-resistant voting
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
