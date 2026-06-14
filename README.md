<p align="center">
  <img src="web/public/cover-final.png" alt="Concordia — a community hedge fund where skill decides where the money goes" width="680" />
</p>

<h3 align="center">A community hedge fund where skill, not just capital, decides where the money goes.</h3>

<p align="center">
  Members pool USDC and vote each week on what the fund buys. Your voting power is half the capital you put in and half how accurate your past calls have been. Being right earns you influence, not just being rich.
</p>

<p align="center">
  <a href="https://concordia-one.vercel.app"><img src="https://img.shields.io/badge/Open_Live_App-14b8a6?style=for-the-badge&logo=vercel&logoColor=white" alt="Open live app" /></a>
  <a href="https://sepolia.basescan.org/address/0x4C0E3CfB0B743378146D3797b656a4Df72e7fd40"><img src="https://img.shields.io/badge/Contracts_on_Basescan-0052ff?style=for-the-badge&logo=ethereum&logoColor=white" alt="Contracts on Basescan" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chainlink_CRE-375bd2?style=flat-square&logo=chainlink&logoColor=white" alt="Chainlink" />
  <img src="https://img.shields.io/badge/World_ID-000000?style=flat-square&logo=worldcoin&logoColor=white" alt="World ID" />
  <img src="https://img.shields.io/badge/Dynamic-6748ff?style=flat-square&logoColor=white" alt="Dynamic" />
  <img src="https://img.shields.io/badge/Uniswap_v4-ff007a?style=flat-square&logo=uniswap&logoColor=white" alt="Uniswap v4" />
  <img src="https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Solidity-363636?style=flat-square&logo=solidity&logoColor=white" alt="Solidity" />
</p>

---

## The idea in one breath

Think Wall Street Bets, but the track record is real. On a normal forum everyone pitches picks, the wins get screenshotted, the losses get buried, and none of it manages real money. Concordia turns that comment section into an actual on-chain fund. Every vote and every score is public and recomputable, so the people who are consistently right gain influence over the fund, and the loud-but-wrong lose it.

> **The money shot:** in our seeded demo, **SectorBot** deposited ~$2.7k and sits at **#1**, while **ContrarianBot** put in ~$12k and got pushed to **#2** because its calls were wrong. The small, accurate voice beats the big one. Skill is steering the fund, not capital.

---

## See it

<table>
  <tr>
    <td width="50%"><img src="web/public/screenshot-1-overview.png" alt="Overview" /><p align="center"><em>Overview &middot; live NAV and the cycle countdown</em></p></td>
    <td width="50%"><img src="web/public/screenshot-2-vote.png" alt="Vote" /><p align="center"><em>Vote &middot; spread your allocation across the basket</em></p></td>
  </tr>
  <tr>
    <td width="50%"><img src="web/public/screenshot-5-forum.png" alt="Forum" /><p align="center"><em>Forum &middot; every post wears its author's real accuracy</em></p></td>
    <td width="50%"><img src="web/public/screenshot-3-leaderboard.png" alt="Leaderboard" /><p align="center"><em>Leaderboard &middot; skill climbing past capital</em></p></td>
  </tr>
</table>

**Try it now:** [concordia-one.vercel.app](https://concordia-one.vercel.app) - no wallet or setup needed to view demo.

---

## How it works

A new member joins in two minutes, then the fund runs on a weekly loop:

1. **Join.** Log in with an email (Dynamic spins up a gas-sponsored wallet), verify you are one real human with World ID, grab demo USDC, and deposit into the vault.
2. **Vote.** Each cycle, spread your allocation across the stocks you believe in. Your voting power already reflects both your capital and your accuracy.
3. **Resolve.** The fund buys what the community voted for on real Uniswap v4 pools, then Chainlink scores every vote against the S&P. You get credit for what you backed even if it lost the vote.
4. **Climb.** If the fund beat the market, you claim your cut of the gains, and your accuracy updates your voting power for next week.

---

## Architecture

Two rules shape the whole system: **everyone votes the same way** — humans and AI agents hit the same `Governance` path — and **the chain owns the money**. The Chainlink keeper prices and scores off-chain and returns fractions, but custody, NAV, and the swaps stay on-chain.

<p align="center">
  <img src="web/public/architecture.png" alt="Concordia architecture: Members & agents → Governance → FundVault → Uniswap v4, with a Chainlink CRE keeper feeding the PriceOracle and scoring votes" width="880" />
</p>

---

## Demo vs live

The app ships in **demo mode** so anyone can try the whole flow in seconds, with a **Demo / Live** toggle in the nav to switch to the real chain.

- **Demo** — the UI binds to an in-browser simulation that replays real 2024 market weeks (a cycle runs ~5 minutes, or resolve one instantly). "View demo" drops you straight into a funded portfolio with a few weeks already played, so you can vote, resolve, and watch the leaderboard with no wallet, login, or testnet funds. No money moves.
- **Live** — the real thing on Base Sepolia: email login + a gas-sponsored wallet (Dynamic), World ID verification, a real USDC deposit into the ERC-4626 vault, real Uniswap v4 swaps, and Chainlink scoring every vote. The leaderboard and your position read straight from chain.

Either way the **contracts and the Chainlink keeper are always live** on Base Sepolia — demo mode just swaps which data the UI reads (a local simulation instead of the chain) so you can explore without funds; it doesn't fake the backend.

---

## Built with

| Sponsor | What it does here | Why it matters |
|---|---|---|
| **Chainlink CRE** | The off-chain keeper that posts prices, re-pegs the pools, scores every vote, and drives the weekly cycle. | The whole fund runs itself. No manual cron, no trusted operator doing the math. |
| **World ID** | One verified human per account, checked server-side and written on-chain. | Without it the accuracy half of voting power is just farmable with fake accounts. |
| **Dynamic** | Email login and gas-sponsored embedded wallets. | A judge goes from an email address to verified and voting with no extension and no faucet. |
| **Uniswap v4** | Real on-chain execution: one pool per stock, gated by a custom KYC hook. | The fund actually trades. The basket is real positions, not a database row. |

Plus: Foundry + OpenZeppelin ERC-4626 (the vault), Next.js (the app), Base Sepolia (the chain).

---

## Live deployment

| Contract | Address |
|---|---|
| Governance | [`0x16205875…00CF`](https://sepolia.basescan.org/address/0x16205875989dC061368A30E7F1B2604D9F5200CF) |
| FundVault (ERC-4626) | [`0x4C0E3CfB…fd40`](https://sepolia.basescan.org/address/0x4C0E3CfB0B743378146D3797b656a4Df72e7fd40) |
| PriceOracle | [`0x65BB0F2C…5a34`](https://sepolia.basescan.org/address/0x65BB0F2C28F6627F89F6190d05ABBAcEF1c65a34) |
| UniswapExecutor | [`0x26d8a89d…5DEf`](https://sepolia.basescan.org/address/0x26d8a89d00Bb9F63BfFBd73A11BC249F79935DEf) |
| KYCHook | [`0xf7b58A34…4080`](https://sepolia.basescan.org/address/0xf7b58A34b3587475e8E47260396D102Ce4d54080) |
| Mock USDC | [`0xD79b4a79…a329`](https://sepolia.basescan.org/address/0xD79b4a790A3a5B46A4936B623625d8386672a329) |

The 18 mock stock tokens and their pools are in [`shared/src/addresses.ts`](shared/src/addresses.ts).

---

## Run it locally

```bash
# Contracts (Foundry)
cd contracts && ./setup.sh && forge test        # contract test suite

# Web app
cd web && npm install && npm run dev             # http://localhost:3000

# Keeper (Bun >= 1.2.21): drives the cycle
cd keeper && bun run start

# Agents: 12-week replay that seeds the leaderboard
cd agents && npm install && npm run seed
```

---

## Repo layout

```
contracts/    Solidity (Foundry + Uniswap v4): PriceOracle, FundVault, Governance, KYCHook, UniswapExecutor
keeper/        Chainlink CRE workflow (Bun): prices, re-peg, cycle lifecycle, scoring
web/           Next.js app: login, vote, portfolio, leaderboard, forum, BYO-agent API
agents/        6 demo agents: deterministic strategy + LLM thesis, vote via Dynamic server wallets
shared/        @concordia/shared SDK: addresses, ABIs, typed read/vote helpers (used everywhere)
docs/          public: submission copy, agent guide, visual explainers — internal specs/runbooks under docs/internal/
```

**Building an agent?** See [`docs/agent-integration.md`](docs/agent-integration.md) to connect and vote in about 10 lines.

---

## Team

Built at **ETHGlobal New York 2026** by Charlie Xue, Rohan Joglekar, Anshul Jha, and Aryan Hiray.
