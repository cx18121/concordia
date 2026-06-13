# Frontend port + integration — design

**Date:** 2026-06-13
**Status:** approved (design), ready for implementation plan
**Scope:** workstream D — port the `redesign/mockups/` HTML into the `web/` Next.js app, wire auth (Dynamic) + identity (World ID), and connect to the backend through `@concordia/shared` behind a mock→live seam.

## Goal

Turn the static HTML mockups into one working Next.js SPA that runs the judge demo flow:

> land → World ID verify → get demo USDC + deposit → vote → watch the cycle resolve → accuracy score → claim

with email login + an embedded wallet + invisible gas (no browser extension, no faucet for the judge).

## Decisions (locked in brainstorming)

1. **One Next.js SPA**, not static HTML. Forced by the tooling: Dynamic (login + embedded wallet + sponsored gas) and World ID IDKit are React-only, and live data binding needs reactive state.
2. **Porting ≠ rewriting.** Reuse the mocks' markup and CSS verbatim. The mocks use plain CSS (custom properties + `shell.css`), **not** Tailwind — do not rewrite to Tailwind. Tailwind stays available but unused on ported pages.
3. **Keep the Overview animation imperative.** The cinematic Overview's drag-scrub / morph / SVG-chartfield JS is kept as-is and run inside a `useEffect`. Do **not** reimplement it in React/Framer.
4. **Hybrid sequencing.** Build against a thin mock data layer now; deploy contracts in parallel; flip to live reads/writes when `shared/src/addresses.ts` is filled in. No UI rewrite on the flip.
5. **Dynamic, full.** Email login → embedded wallet → sponsored gas. This is the biggest single integration but it is the locked stack and the judge experience depends on it.
6. **Landing is public.** `/` (Overview) shows live fund state without login; login + World ID verify trigger on the **Join** action, not at the root.
7. **All 6 pages ported** into one consistent shell, but **data wiring only on the demo-path screens** (Overview, Join flow, Vote). Secondary pages (Leaderboard, Account, Settings) render on mock content. Forum stays a stretch goal (cut from v1).

## Architecture

```
web/src/
  app/
    layout.tsx          DynamicProvider + <Nav> + global CSS (shell.css)
    page.tsx            Overview (cinematic), PUBLIC — live state, no login
    vote/page.tsx
    leaderboard/page.tsx
    account/page.tsx
    settings/page.tsx
    api/verify/route.ts        (exists)
    api/rp-signature/route.ts  (exists)
  components/
    Nav.tsx             shell.js rewritten as JSX (trivial markup)
    WorldIDVerify.tsx   (exists) — becomes a step inside JoinFlow
    JoinFlow.tsx        Dynamic login → World ID → get-USDC → deposit
  lib/
    data.ts             THE SEAM — see below
  styles/               shell.css + per-page CSS, copied verbatim from mocks
```

### The seam: `lib/data.ts`

A thin switch, not a new abstraction. Exposes only the functions the UI binds to, mirroring `@concordia/shared`:

- reads: `useCycle()`, `usePrices()`, `usePosition()`, `useVotingPower()`, `useAccuracy()`, `useLeaderboard()`
- writes: `getDemoUSDC()`, `deposit(amount)`, `castVote(allocs)`, `claim()`

`NEXT_PUBLIC_USE_MOCK=true` → mock adapter returns seeded objects (no chain).
`NEXT_PUBLIC_USE_MOCK=false` → live adapter calls the existing `@concordia/shared` helpers (`getCycle`, `getPrices`, `castVote`, …) via viem against Base Sepolia, using the Dynamic wallet for writes.

Keep the mock adapter minimal — only the fields the UI actually renders.

## What is mocked

**Real now (not mocked):**
- World ID verification (real REST call to World; needs RP env vars; nullifier dedup is in-memory).
- Dynamic auth/wallet (real email login, embedded wallet, sponsored gas; needs a Dynamic project).
- The UI itself.

**Mocked now → real when contracts deploy (M2):**
- All chain reads: cycle + countdown, NAV, position/shares, voting power, accuracy, leaderboard, prices.
- All money actions: get-demo-USDC, deposit, `castVote`, claim, cycle resolution (local state / fake confirmations, no tx).
- The on-chain "verified" flag (real proof, but `Vault.verify` doesn't exist yet → in-memory).

**Mocked permanently by project design (not a frontend shortcut):**
- The tokenized stocks are mock ERC-20s on-chain, interfaces identical to real Dinari/xStocks for a mainnet drop-in. Prices come from the Chainlink CRE oracle. True even in live mode.

## Auth + identity flow

1. Judge lands on `/` (Overview), sees live fund state, no login.
2. Clicks **Join**.
3. Dynamic email login → embedded wallet created, gas sponsored.
4. World ID verify (existing `WorldIDVerify` → `/api/rp-signature` → `/api/verify`). On success, wallet marked verified (in-memory now; `Vault.verify` on-chain once deployed).
5. **Get demo USDC** (mock USDC mint) → **deposit** → shares.
6. `/vote` — allocate voting power across the stock universe → `castVote`.
7. Cycle resolves → accuracy score appears → **claim**.

World ID request params (from roadmap): `selfieCheckLegacy`, `allow_legacy_proofs: true` — **not** the default `orb` level.

## Build order (demo-path first)

1. **Shell** — DynamicProvider + `<Nav>` (from `shell.js`) + App Router routes + global CSS.
2. **Overview `/`** — port markup + animation (imperative JS in `useEffect`), bind to mock data, public.
3. **Join flow** — Dynamic login → World ID gate → mock get-USDC + deposit.
4. **Vote `/vote`** — port, bind to mock data, mock `castVote`.
5. **Secondary pages** — Leaderboard / Account / Settings, mechanical paste on mock content.
6. **Flip to live** — when contracts deploy: fill `addresses.ts`, set `NEXT_PUBLIC_USE_MOCK=false`, deposit/vote/verify hit Base Sepolia.

## Out of scope (v1)

- Forum page (stretch goal).
- BYO-agent HTTP API (roadmap stretch).
- Live data on secondary pages.
- On-chain nullifier storage / `Vault.verify` (lands with contracts).

## Dependencies / open items

- Contracts not deployed — `addresses.ts` all `0x0`. Live mode blocked on M2 (parallel track).
- Dynamic project + env keys needed for real login.
- World ID RP app + env keys (`WORLD_RP_ID`, `RP_SIGNING_KEY`) needed for real verify.
- `NEXT_PUBLIC_DEV_BYPASS=true` already exists in `WorldIDVerify.tsx` for clicking through without a real proof.
