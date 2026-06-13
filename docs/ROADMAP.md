# Roadmap & Team Todo

**Goal:** an **always-on live app** judges can use themselves, plus the pitch on top of it. The fund runs continuous fast cycles (every ~5–10 min, agents voting automatically, real Uniswap swaps on Base Sepolia), so the leaderboard is always moving and a judge's own vote resolves *within their visit*. The pitch is then: Act 1 = the app's accumulated history (small-skilled agent has overtaken big-mediocre one); Act 2 = join it live.

**Judge flow (the bar to hit):** email login → gas handled invisibly → "get demo USDC" button → World ID verify → deposit → vote → watch the cycle resolve → accuracy score appears → claim. No faucets, no wallet extensions, no help from us. Landing page shows live state (leaderboard, portfolio, agent theses) without login.

How to use this file: check things off as they land. If you hit a blocker or an unanswered question, add it to `ISSUES.md` instead of stalling. Design detail lives in `DESIGN.md` / `CONTRACTS.md` — this is just who-does-what and in what order.

---

## 🚨 Urgent — time-sensitive, do before anything else

Most research questions are now answered (see `ISSUES.md` Resolved). What's left is people-dependent. In priority order:

- [ ] **Assign workstream owners** (fill the `owner: ____` blanks below) — nothing parallelizes until this is done
- [ ] **Install Foundry + init contracts from v4-template** (instructions in `contracts/README.md`) — blocks workstreams A *and* B, and B is the critical path
- [ ] **Freeze the interfaces** (first task after contracts init) — this is what lets all five workstreams run in parallel
- [ ] **Chainlink booth: request CRE deployment access** (`cre account access`) — has lead time; simulation is the fallback but ask now (ISSUES #5)
- [ ] *(optional)* World booth: sanity-check `selfieCheckLegacy` satisfies the prize (ISSUES #10 — decided, has a fallback, not a blocker). Dynamic booth: ask about native gas sponsorship (we ship the drip regardless, ISSUES #11).

---

## Phase 0 — Setup & unblockers (everyone, first ~2 hours)

These unblock everything else. Do them first, together.

- [ ] Monorepo scaffolding: `contracts/` (Foundry from v4-template), `keeper/` (Node/TS CRE workflow), `web/` (Next.js), `agents/` (Node/TS)
- [ ] **Freeze the Solidity interfaces** (`IPriceOracle`, `IFundVault`, `IGovernance`, `IUniswapExecutor`) and commit the ABIs — *this is the contract between workstreams; change only by team agreement + note in ISSUES.md*
- [ ] Accounts & keys:
  - [ ] Chainlink CRE account + **request deployment access NOW** (lead time; local simulation is the fallback)
  - [ ] World developer portal: `app_id` + action created (one for verify, one for agent linking)
  - [ ] Dynamic environment ID created, test login works
  - [ ] Install **Bun ≥1.2.21** (the CRE TS SDK runs on Bun, not Node) + the CRE CLI
  - [ ] Price API needs **no key** — Yahoo Finance v8 (ISSUES #1). Pull the 12-week historical fixture once and commit it (one URL/ticker, S&P = `%5EGSPC`).
- [ ] Base Sepolia ETH in every dev wallet (Coinbase/Alchemy faucets) + a funded backend "drip" wallet for judge onboarding (ISSUES #11)
- [ ] Deploy **mock USDC** with a public `mint()` (decided, ISSUES #2) — doubles as the "get demo USDC" button
- [ ] Everyone reads `DESIGN.md` + `CONTRACTS.md` (30 min, seriously)

---

## Workstreams (run concurrently after Phase 0)

Each workstream builds against the frozen interfaces + stubs, so nobody waits on anybody until integration.

### A — Core contracts  *(owner: ____)*
PriceOracle, FundVault, Governance. Build vault with **synthetic positions first** (record weights, value at oracle price) so the whole fund logic is testable before Uniswap lands; swap in B's executor at integration.

- [ ] PriceOracle: `setPrices` (onlyKeeper) + views, tests
- [ ] FundVault: ERC-4626 deposit/redeem at NAV, `verified` gate, withdraw queue at boundary
- [ ] FundVault: `totalAssets()` NAV from oracle prices (synthetic positions)
- [ ] FundVault: `settle()` — HWM gate, reward pool from own NAV, `rewardCredit`, `claimRewards`
- [ ] Governance: members, power snapshot (`openCycle`), `castVote`, state machine
- [ ] Governance: `selectBasket` — proportional + cap + dust floor + renormalize, empty-cycle guards
- [ ] Governance: `lockCycle` / `resolveCycle` wiring to vault
- [ ] Foundry tests: full cycle on a local fork with a scripted keeper (no CRE yet)

### B — Uniswap execution layer  *(owner: ____)*  ⚠️ riskiest — start immediately
Standalone `UniswapExecutor` module + the pools. Test against a stub vault; A integrates it behind `executeBasket`/`closePositions`.

- [ ] Mock stock ERC-20s (~8 tickers is plenty for the demo) with mint rights
- [ ] **KYCHook (`beforeSwap` allowlist) deployed via HookMiner/CREATE2 — do this first, it blocks everything**
- [ ] Create v4 pools (mockX/USDC) with hook attached, seed liquidity at realistic prices
- [ ] `UniswapExecutor`: swap USDC→token and token→USDC via Universal Router (+Permit2), tests
- [ ] Re-peg helper: small swap to move pool price to a target (keeper calls this)
- [ ] Deployed + verified on Base Sepolia, addresses committed to a shared `deployments.json`

### C — Keeper (Chainlink CRE)  *(owner: ____)*
The off-chain brain. Develop against an anvil fork + frozen ABIs; doesn't need A finished. **Runs on Bun ≥1.2.21** (CRE TS SDK requirement) — keep it its own package, separate from the Node toolchain.

- [ ] CRE workflow scaffold from `cre-templates` (cron trigger), local simulation running
- [ ] **Price source behind an interface** — `ReplayFixtureSource` (historical 2024 weeks, loops) and `LiveAPISource` (real-time), selected by config. Demo vs production is a config flag, not a fork.
- [ ] Job 1: fetch stock + S&P prices from price source → `Oracle.setPrices`
- [ ] Job 2: pool re-peg via B's helper (needs B on testnet; stub until then)
- [ ] Job 3: resolve compute — read votes + prices on-chain, compute per-member EWMA accuracy + creditWeightBps → `Governance.resolveCycle`
- [ ] Lifecycle triggers: open → lock → resolve on the cycle schedule
- [ ] **Always-on mode:** loop cycles continuously every N minutes (see ISSUES #12), stepping through the historical price series on repeat — this IS the live app's heartbeat and replaces a one-time replay seed
- [ ] Same logic exposed as a plain script too (local tests + hosting fallback)
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
- [ ] Stretch: forum (pitch feed with live P&L badges — see prototype). P&L is measured vs oracle prices, so it works identically in replay mode. Display **market-time**, not wall-time ("posted 2 cycles ago ≈ 2 market-weeks"), and agents' theses auto-populate the feed each cycle.

### E — Agents + replay  *(owner: ____ — can double with C)*
The 6 demo agents and the 12-week replay that seeds the leaderboard. Reuses C's resolve logic.

- [ ] 6 deterministic strategies (momentum, value, mean-rev, sector, low-vol, contrarian) over the historical price series
- [ ] Historical data: 12 weeks of real prices for the universe + S&P (committed as fixture; loops in always-on mode)
- [ ] LLM thesis layer (one short rationale per vote; cache outputs so the app never waits on an API)
- [ ] Agents vote automatically every cycle in always-on mode (they're the app's life — judges should always see fresh activity)
- [ ] Seed script: fund agent wallets, deposits (10k/6k/4k/3k/2k/1k), run enough cycles that the leaderboard tells the story (small-skilled > big-mediocre) — **tune the window/strategies until it does**

---

## Phase 2 — Integration milestones (in order)

- [ ] **M1 — Full cycle on local fork**, scripted: deposit → open → vote → lock (real swaps) → price move → resolve → claim. No UI.
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
