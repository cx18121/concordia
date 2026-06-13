# Open Questions & Issues

Running list. Add anything that blocks you or needs a team decision — don't stall on it silently. When something's resolved, move it to the bottom with the answer (decisions that change the design also get reflected in `DESIGN.md`).

Format: **#N — title** · status · owner · what unblocks it.

---

## Open

**#1 — Which stock price API?** · OPEN · owner: ____
Candidates: xStocks public API (`api.backed.fi/api/v2/public/...` — no auth, has prices for our tickers), or any plain finance API (Polygon.io, Finnhub, Alpha Vantage — need keys/rate limits). Also need 12 weeks of *historical* prices for the replay (can be a committed fixture — doesn't need to come from the same API). Decide + get keys in Phase 0.

**#2 — Mock USDC or Circle's Base Sepolia USDC?** · OPEN · owner: ____
Circle USDC exists on Base Sepolia (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`, faucet at faucet.circle.com) — more "real," but faucet drips are small and we need a LOT to seed pools + fund 6 agents. Mock USDC = full mint control, less real. Leaning **mock** for control; flips a constructor arg either way.

**#3 — World ID proof verification on Base Sepolia** · OPEN · owner: ____ · ⚠️ verify early
Is there a World ID router/verifier contract deployed on Base Sepolia for on-chain `verifyProof`, or do we verify in our backend (Developer Portal API) and have the backend attest to the Vault? Backend verification is explicitly allowed by World's prize rules and is the easy fallback — but decide before building `Vault.verify`. Ask the World booth.

**#4 — AgentKit ↔ Dynamic wallet compatibility** · OPEN · owner: ____
Can a Dynamic server wallet be registered as the agent address in AgentKit (`agentkit-cli register <addr>`)? No reason it shouldn't (it's just an EVM address + signMessage), but unverified. Ask World/Dynamic booths. Fallback: register a plain keypair for the agent and have Dynamic delegate to it.

**#5 — CRE deployment access timing** · OPEN · owner: ____
CRE live deployment is early-access (`cre account access`); Chainlink said at the event they'll deploy simulated workflows for teams. Local simulation qualifies for the prize. Request access in Phase 0; build everything simulation-first.

**#6 — How much liquidity per pool, and who holds the LP position?** · OPEN · owner: ____
Pools need enough depth that the vault's basket swaps don't blow through them (big slippage = NAV noise vs oracle). Since we mint the mock tokens, we can seed deep. Need a number once we know fund size (~26k USDC of agent deposits + human demo deposit). Rule of thumb: seed each pool ≥10× the largest expected single swap.

**#7 — Withdraw queue: build or cut for demo?** · OPEN · owner: ____
Epoch-locked withdrawals are in the design, but the demo never shows a withdrawal. Option: implement simple direct `redeem` when state==IDLE (between cycles) and skip the queue machinery. Decide when A gets there — don't gold-plate.

**#8 — Demo cycle timing** · OPEN · owner: ____
Replay cycles run as fast as the script allows. The live human cycle on stage: how long is the voting window (~1 min?), and how do we make "a week passes" happen in seconds (keeper posts next week's historical prices immediately)? Needs a concrete stage script in Phase 3.

**#9 — Who owns which workstream?** · OPEN
Fill in the `owner: ____` blanks in ROADMAP.md at kickoff.

**#10 — World ID for judges who don't have World App** · OPEN · owner: ____ · ⚠️ decide early
World ID verification needs the World App on the judge's phone (device-level verification is instant, no Orb needed — but the app must be installed). World-track judges will have it; other judges may not. Options: (a) a couple of pre-verified demo accounts judges can log into, (b) a clearly-labeled "demo bypass" that marks the account unverified-but-allowed. Must not undermine the World submission — the real path has to be the default and actually work. Ask the World booth what they expect.

**#11 — Gas for judges' embedded wallets** · OPEN · owner: ____
Judges' fresh Dynamic wallets have zero ETH. **Verified 6/12:** Dynamic's EVM gas sponsorship explicitly supports Base Sepolia (84532) — but only for **V3 MPC embedded wallets**, and it **requires contacting Dynamic to enable** on your environment. Action: ask at the Dynamic booth / support TODAY. Fallback: our backend drips ETH to new wallets on signup. Either way it must be invisible — a judge can never be told to find a faucet.

**#12 — Cycle cadence for always-on mode** · OPEN · owner: ____
How long is one cycle in live mode? Tradeoff: judge patience (their vote should resolve within their visit) vs. enough voting-window time to act. Strawman: **5 min total — 90s voting window, 3.5 min hold.** Make it a keeper config value and tune on-site. Also decide what the UI shows someone who lands mid-hold (countdown + deposit-queues-anytime + browse).

**#13 — Hosting: web + keeper** · OPEN · owner: ____ · leaning below
Web on Vercel (easy, auto-deploys from GitHub). The keeper must run *continuously* — Vercel can't do that. **Leaning: Railway** for the keeper + agents (we have prior Railway experience; supports Bun via Dockerfile/nixpacks), or the deployed CRE workflow if access lands (#5). Be honest in the submission about what runs where (CRE simulated/deployed vs. script driver).

---

## Resolved

*(move items here with the answer + date)*

- **Chain: Base Sepolia, not Arc** — Uniswap v4 live + verified there; Arc has no Uniswap deployment. (Verified 6/12, see CLAUDE.md locked decisions.)
- **Resolve compute: CRE off-chain, money on-chain** — Option B hybrid; see CONTRACTS.md §1. (6/12)
- **No real tokenized stocks on any usable testnet** — Ondo/xStocks/Dinari all mainnet-only or gated; Robinhood Chain has them but is an isolated chain. We deploy mocks. (Verified 6/12)
- **Top-N selection replaced** — basket is proportional-to-votes with cap + dust floor; count emerges from votes. (6/12, DESIGN.md)
- **Confidential AI Attester cut** — only served agent theses; not KYC; weak fit. (6/12)
- **Tech stack verified, no dependency conflicts** (6/12, fetched docs + npm): World ID = **JavaScript/React** (`@worldcoin/idkit` 4.1.8, `react >=18` — the "Go/Python only" worry was a mix-up with the CRE SDK); backend verify is REST (any language). AgentKit = TS/Node, **v0.2.0 beta**. CRE SDK = TS + Go; **TS SDK requires Bun ≥1.2.21**. Dynamic = React SDK (viem ≥2.45.3, wagmi ≥2.14.11, react 18–19) + Node server wallets; Base Sepolia ✓. Uniswap v4-sdk = TS (ethers-v5 internals, coexists with viem). Next.js confirmed as frontend (API routes host the World ID verify + AgentKit endpoints). React 18/19 + Next 14/15 satisfies every peer dep.
