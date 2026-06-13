# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ETHGlobal NY 2026 hackathon project: a **Community Hedge Fund DAO** — members pool USDC and vote weekly on stock allocations; voting power is 50/50 capital + proven accuracy. Human-first (Kalshi-style); agents vote through the same path.

**Status: design-complete, no code yet.** Don't fabricate build/test commands until the scaffolding exists.

## Read first (canonical)

- **`docs/DESIGN.md`** — locked decisions + tunable constants (values adjustable, decisions settled).
- **`docs/CONTRACTS.md`** — build-ready contract spec: state, functions, access, call graph, on/off-chain boundary. Source of truth for implementation.
- **`docs/ROADMAP.md`** — workstreams + team todo; check items off as they land. **`docs/ISSUES.md`** — open questions; add blockers there instead of stalling, move resolved items down with the answer.
- `docs/explainers/*.html` are visual explainers (open in a browser), not logic source.

## Architecture in brief

Three contracts + a hook on **Base Sepolia**:
- **PriceOracle** — Chainlink CRE writes stock prices + S&P here; everything reads it.
- **FundVault** (ERC-4626) — all money: custody, shares, NAV, positions, rewards, the Uniswap swaps.
- **Governance** — votes, voting-power snapshot, accuracy, basket selection, cycle lifecycle (`IDLE→OPEN→LOCKED→IDLE`).
- **KYCHook** — Uniswap v4 `beforeSwap` allowlist gating the pools to the verified Vault.

Two things that span files: **(1)** CRE computes per-member scoring off-chain and returns *fractions*; the contract owns all money math (pool size from its own NAV, HWM gate, custody). Don't move money math off-chain. **(2)** NAV/accuracy value at the *oracle* price; swaps execute at the *pool* price; CRE re-pegs pools each cycle to keep them aligned.

Conventions: **no floats on-chain** (prices `E8`, weights `bps`, accuracy signed `E4`); **selection emerges from votes** (proportional + cap + dust floor, no fixed top-N); tokenized stocks are **mocked** (keep interfaces identical to real Dinari/xStocks tokens for a mainnet drop-in).

## How we work here (hackathon mode — the demo must work)

The goal is a live demo that works on stage. That means **verify narrow, not wide**: the exact demo path has to actually run; everything off it can be rough.

- **Build the demo path first, then make it bulletproof.** Identify the precise end-to-end flow you'll run on stage and get it working start to finish before anything else.
- **The demo path must actually run — confirm by running it, not by assuming.** A flow that "should work" but was never executed end-to-end is the #1 way hackathon teams fail at the booth. Run it, then rehearse it.
- **Cut breadth, not depth.** Skip edge cases, other user paths, scale, error states, admin tooling — anything that won't be on screen. Do *not* skip making the on-stage flow solid.
- **Don't code the new stack from memory.** It's new and moving fast — check the doc page (links below) before using an API. A wrong guess costs more than a 30-second read.
- **Lean on what exists.** Start from `v4-template`, `cre-templates`, OZ bases. Don't rebuild what a template gives you.
- **Be honest about state.** Say what's stubbed, mocked, or untested — don't claim "done" when it only compiles. Teammates build against your pieces and the demo depends on them.
- **Stuck? Re-scope, don't grind.** After 2–3 failed attempts, question the approach or cut the feature. Time is the scarce resource — but never cut from the demo path itself.
- **Commits: `type: short summary` + at most one or two plain lines on *why*.** Use `feat:` / `fix:` / `chore:` / `docs:` / `refactor:`. Keep the subject brief. Write for a human reading the log (judges do) — explain the non-obvious *why* in a line or two only when there's a decision or tradeoff; otherwise just the subject. **Keep bodies short — no multi-paragraph write-ups, no bullet lists.** Describe the change itself, never the internal process that produced it (no "addressed review", no tool names).
- **Check off `docs/ROADMAP.md` as you go.** When you finish a roadmap item, flip its `[ ]` → `[x]` in the same commit (and tick the parent task when all its children are done). Keep it honest and current — it's the team's shared view of real progress.

## Tech-stack docs (new tech — read before using)

| Tool | Docs |
|---|---|
| Foundry | https://getfoundry.sh |
| Uniswap v4 | https://developers.uniswap.org/contracts/v4/overview · template: https://github.com/Uniswap/v4-template · deployments: https://developers.uniswap.org/contracts/v4/deployments |
| Chainlink CRE | https://docs.chain.link/cre · templates: https://github.com/smartcontractkit/cre-templates |
| World ID | https://docs.world.org/world-id/overview · AgentKit: https://docs.world.org/agents/agent-kit |
| Dynamic | https://www.dynamic.xyz/docs · agents/server wallets: https://www.dynamic.xyz/docs/overview/agents/overview |
| OpenZeppelin ERC-4626 | https://docs.openzeppelin.com/contracts/5.x/erc4626 |
| Base Sepolia | network + faucets: https://docs.base.org/chain/network-faucets · USDC faucet: https://faucet.circle.com |

**Languages (verified 6/12):** TypeScript everywhere off-chain, Solidity on-chain. One exception: the keeper — the CRE TS SDK (`@chainlink/cre-sdk`) **runs on Bun ≥1.2.21, not Node** — keep it its own package. World ID backend verification is a plain REST call (`POST developer.world.org/api/v4/verify/{rp_id}`) from a Next.js API route; IDKit is React (`react >=18`, works with 18/19). AgentKit is v0.2.0 **beta** — expect rough edges. Uniswap `v4-sdk` uses ethers-v5 types internally but coexists fine with viem v2 (Dynamic needs viem ≥2.45.3, wagmi ≥2.14.11).

## Locked decisions — don't relitigate without strong cause

Base Sepolia (Uniswap v4 is live there; Arc isn't) · sponsors Chainlink + World + Dynamic, plus real Uniswap v4 execution · cut: Confidential AI Attester and the forum's influence-amplification math · forum is a stretch goal.

*When scaffolding lands, replace the intended stack note with real `forge build` / `forge test` / keeper-run commands.*
