# Open Questions & Issues

Running list. Add anything that blocks you or needs a team decision — don't stall on it silently. When something's resolved, move it to the bottom with the answer (decisions that change the design also get reflected in `DESIGN.md`).

Format: **#N — title** · status · owner · what unblocks it.

---

## Open — needs a person (booth visit or team kickoff)

**#5 — CRE deployment access timing** · OPEN · owner: ____ · ⚠️ has lead time
CRE live deployment is early-access (`cre account access`); Chainlink said at the event they'll deploy simulated workflows for teams, and **local simulation qualifies for the prize.** Request access in Phase 0; build simulation-first regardless.

**#9 — Who owns which workstream?** · OPEN
Fill the `owner: ____` blanks in ROADMAP.md at kickoff. Nothing parallelizes until this is done.

**#10 — World ID for judges (which credential level?)** · OPEN · owner: ____ · ⚠️ confirm at booth
Research (6/12) resolved the mechanics — see Resolved #3. Remaining *decision*: which credential level we request. **Recommendation: `selfieCheckLegacy`** (a new judge with no World App can verify via a selfie in ~minutes; works in invite-code mode on iOS) with `allow_legacy_proofs: true` and REST verification. Confirm at the World booth that this satisfies their prize (it's real proof-of-personhood, not a bypass). Keep one pre-verified demo account as an absolute fallback if a judge's phone fights the flow on stage.

---

## Resolved

*(answers folded in from research 6/12; design-changing ones also reflected in DESIGN.md / CONTRACTS.md)*

- **#1 — Price API: Yahoo Finance v8 chart API** (verified, returns data for all 19 tickers + S&P). No auth, no key — just a browser `User-Agent` header. **Live:** `GET query1.finance.yahoo.com/v8/finance/chart/{symbol}` → `.chart.result[0].meta.regularMarketPrice` (one call/ticker; v7 batch is locked). **Historical fixture:** same endpoint `?period1=1704067200&period2=1711929600&interval=1wk` → 13 weekly closes for early 2024; run once per ticker at kickoff, commit as JSON. **S&P 500 symbol = `%5EGSPC`** (URL-encoded `^GSPC`) — works for both. Rejected: Stooq (JS-challenge blocks server curl), xStocks API (metadata only, no prices, missing 17/18 tickers). Caveat: unofficial endpoint — add retries.
- **#2 — Use mock USDC.** Need six figures to seed 8 pools deep + fund 6 agents; Circle's faucet drips a few dollars. Mock USDC's public `mint()` doubles as the "get demo USDC" button. One constructor arg swaps to real USDC for production.
- **#3 — World ID verification: use the REST backend path.** A v3 `WorldIDRouter` *does* exist on Base Sepolia (`0x42FF98C4E85212a5D31358ACbFe76a621b50fC02`) but on-chain v3 is **Orb-only** (no good for ad-hoc judges) and v4's on-chain verifier is World Chain only. So verify via `POST developer.world.org/api/v4/verify/{rp_id}` (chain-agnostic, accepts non-Orb credentials) in a Next.js API route; the backend then marks the wallet verified in the Vault. This is explicitly allowed by World's prize rules. IDKit default level is `orb` — **must override** to a lower level (see #10).
- **#4 — AgentKit ↔ Dynamic server wallet: compatible, YES.** AgentKit registration is gated by a **human's World ID proof**, not an agent-wallet signature — the agent address is just data, so any address type registers. A hosted relay pays the registration gas (agent needs no funds). Registration happens on **World Chain (`eip155:480`)**, not Base. Request-time x402 signing needs a standard EIP-191 signature, which Dynamic MPC server wallets produce — works without special handling. (Note: AgentKit is v0.2.0 beta.)
- **#6 — Pool liquidity: seed ~100k USDC-equivalent per pool.** Largest plausible single swap ≈ fund size × position cap ≈ 30k × 30% ≈ 9k; 100k depth keeps price impact small (≥10× rule). Free with mock USDC; we mint + hold the LP position ourselves.
- **#7 — Cut the withdraw queue.** Allow direct `redeem` only while cycle state == IDLE (between cycles) — gives epoch-locking with a fraction of the code. The demo never shows a withdrawal. Don't gold-plate.
- **#8 + #12 — Cycle cadence: 5-minute cycles** (90s voting window, ~3.5 min hold), as a keeper config value, tuned on-site. These two were the same question — the stage demo *is* the live app, so there's no separate "stage timing." Always-on keeper posts the next week's historical prices each cycle; "a week passes" = one cycle tick.
- **#11 — Gas for fresh wallets: server-side drip (primary).** The need isn't "sponsorship" — it's getting free testnet ETH into zero-balance wallets so transactions can be sent at all. **Plan: a backend drip** (~20 lines: one funded wallet sends ~0.001 Base Sepolia ETH to each new wallet on signup) — keeps every wallet a plain address, depends on nobody. Dynamic alternatives (verified 6/12): native sponsorship covers Base Sepolia but is **contact-us gated** + V3-MPC-only; ZeroDev sponsorship is self-serve but wraps wallets in smart accounts (changes addresses → ripples into `verified`/nullifier mappings — avoid). Ask Dynamic booth about native enablement as a nice-to-have; ship the drip.
- **#13 — Hosting: Vercel (web) + Railway (keeper + agents).** Web auto-deploys from GitHub. Keeper must run continuously (Vercel can't) — Railway supports Bun via Dockerfile/nixpacks, and we have prior Railway experience. Use deployed CRE instead if access lands (#5). Be honest in the submission about what runs where.

---

### Earlier resolved (6/12)

- **Chain: Base Sepolia, not Arc** — Uniswap v4 live + verified there; Arc has no Uniswap deployment. (Verified 6/12, see CLAUDE.md locked decisions.)
- **Resolve compute: CRE off-chain, money on-chain** — Option B hybrid; see CONTRACTS.md §1. (6/12)
- **No real tokenized stocks on any usable testnet** — Ondo/xStocks/Dinari all mainnet-only or gated; Robinhood Chain has them but is an isolated chain. We deploy mocks. (Verified 6/12)
- **Top-N selection replaced** — basket is proportional-to-votes with cap + dust floor; count emerges from votes. (6/12, DESIGN.md)
- **Confidential AI Attester cut** — only served agent theses; not KYC; weak fit. (6/12)
- **Tech stack verified, no dependency conflicts** (6/12, fetched docs + npm): World ID = **JavaScript/React** (`@worldcoin/idkit` 4.1.8, `react >=18` — the "Go/Python only" worry was a mix-up with the CRE SDK); backend verify is REST (any language). AgentKit = TS/Node, **v0.2.0 beta**. CRE SDK = TS + Go; **TS SDK requires Bun ≥1.2.21**. Dynamic = React SDK (viem ≥2.45.3, wagmi ≥2.14.11, react 18–19) + Node server wallets; Base Sepolia ✓. Uniswap v4-sdk = TS (ethers-v5 internals, coexists with viem). Next.js confirmed as frontend (API routes host the World ID verify + AgentKit endpoints). React 18/19 + Next 14/15 satisfies every peer dep.
