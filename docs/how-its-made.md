# How it's made

The engineering deep-dive behind [Concordia](../README.md) — the architecture, the on-chain/off-chain split, and the three sponsor integrations that carry it. The [README](../README.md) has the product story; this is the build.

---

## The monorepo

A few pieces that all speak to the same contracts:

- **Contracts** (Solidity, Base Sepolia) — four of them:
  - `PriceOracle` — where stock prices and the S&P get written.
  - `FundVault` — the ERC-4626 vault over USDC that holds all the money (shares, NAV, custody).
  - `Governance` — votes, accuracy scores, basket selection, and the cycle state machine.
  - `KYCHook` — the Uniswap v4 gate (plus `UniswapExecutor`, the fund's swap arm).
- **Keeper** — a Chainlink CRE workflow that runs the weekly cycle.
- **Web** — a Next.js frontend that also hosts the forum and a small HTTP API for outside agents.
- **Shared SDK** — a TypeScript package holding the contract interfaces, addresses, and read/vote helpers, so the frontend, keeper, and agents all talk to the contracts the same way.

---

## The core design call: chain vs. keeper

The main decision was splitting the work between the chain and a keeper that runs off it.

The **contracts hold anything that has to be trustless**: the pooled USDC, the shares and NAV, the votes, and the accuracy scores. The **keeper does what a contract can't** — fetching stock prices off a public API and running the heavier per-member math.

We held to one rule for the boundary: **the keeper only ever hands back fractions.** It tells the contract each member's new accuracy and their cut of the rewards, and the contract turns that into real USDC using its own NAV. Votes going in and scores coming out are both on-chain, so anyone can re-run a cycle and check our work. The keeper can *inform* the fund; it can never move its money.

---

## Chainlink CRE — connecting the two sides

Chainlink CRE is the orchestration layer between the chain and the off-chain work. Every contract can take a write from Chainlink, or from a plain backup script if CRE has issues, on the **same code path** either way.

For the live demo we skip the full deployment and run the workflow as an **HTTP-triggered job**: each `POST` is one tick that reads the on-chain state, pushes it a step forward, and writes real testnet transactions. One tick fetches prices and writes them to the oracle, re-pegs the pools, scores the previous cycle's votes, and advances the lifecycle (`IDLE → OPEN → LOCKED → resolve`).

The CRE TypeScript SDK runs on Bun; the workflow is exercised with `cre workflow simulate --broadcast`, which writes real Base Sepolia state.

---

## The hardest part: trading on Uniswap v4

Every stock has a real Uniswap v4 pool against USDC, and the `KYCHook` puts a `beforeSwap` allowlist on each one so only the verified fund can trade. Two parts were genuinely tricky:

1. **Mining the hook address.** A v4 hook has to encode its permissions in its own address, so we mine the address with `CREATE2` (HookMiner) until it lands with exactly the `BEFORE_SWAP_FLAG` bit set — otherwise `BaseHook`'s constructor validation reverts.
2. **Gating the fund, not a router.** `beforeSwap` only sees whoever *called* the pool, not the original sender. Route through the standard Universal Router and you'd be gating the router, not the fund — which defeats the point. So our `UniswapExecutor` is **its own tiny router**: it calls `PoolManager.unlock → swap` directly, so the hook sees the executor (the fund) as `beforeSwap.sender`.

One more catch: **NAV is priced at the oracle, but swaps execute at the pool price.** If those drift, every trade shows fake profit or loss. So each cycle the keeper **re-pegs every pool** with a small swap that nudges it back to the oracle price (CRE plays the arbitrageur).

---

## Identity: World ID + Dynamic

**World ID** handles personhood. Its on-chain verifier on Base Sepolia is Orb-only, which is no use to someone who's never opened World App — so we verify the IDKit proof on **our own backend against World's v4 REST API**, then **write the result onto the vault**. That attestation is what gates deposits and voting; without it, the accuracy half of voting power would just be farmable with fake accounts. (`web/src/app/api/verify`.)

**Dynamic** handles wallets. Sign up with an email and you get a **gas-sponsored embedded wallet**, so you go from an email address to verified-and-voting with no extension and no faucet. The same wallet infrastructure is the rail delegated agents use to sign votes through the identical `Governance.castVote` path.

---

## The shared math

Two pieces of logic, written once and shared between the contracts and the replay engine:

- **Basket selection** turns votes into positions — weighted by how much support each stock got, with a **cap** on any single position and a **floor** that drops tiny ones, so a lightly-voted week can correctly leave part of the fund in cash.
- **Scoring**, run when a cycle resolves, grades each member on how well their picks did against the S&P, **smooths** that into a running accuracy score (so one good or bad week doesn't swing it), and uses it to set voting power for next cycle: half capital, half proven accuracy — with the accuracy half **eased in over a newcomer's first few cycles** so a lucky first pick can't rocket someone to the top. The reward pool then goes to whoever actually backed the winners.

You get credit for the stocks you backed even if they didn't make the final basket — so being right when everyone else was wrong still moves your voting power.
