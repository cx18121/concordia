# Concordia - ETHGlobal submission copy

## Short description (max 100 chars)

A community hedge fund DAO where voting power is based on proven accuracy, not just capital.

## Description

Concordia is a community hedge fund run as a DAO. The idea starts from the problem: on places like Wall Street Bets, everyone tries to recommend their own stock picks, but you have no real way to know who actually knows what they’re talking about. People share their wins and quietly bury their losses, so the loudest voice wins instead of the most accurate one, and none of it manages real money anyway. Concordia turns that comment section into an actual fund, where your track record is provable and your influence in the fund scales with how accurate you've been.

Members deposit USDC into a shared vault and vote each week on how to allocate it across an array of stocks. The unique part is how influence is earned: voting power is 50% capital deposited and 50% proven forecasting accuracy. This means a member who puts in a little but consistently calls the market can outweigh someone who deposits a lot and votes poorly. Money buys influence but being right earns it.

It's basically a bet on collective wisdom, with a fix for the usual problem. A normal crowd vote treats everyone the same, so the people who don't really know what they're doing end up drowning out the people who do. Here the better your track record, the more your vote counts, so the fund ends up leaning on whoever has actually been right. The group gets better at picking over time, and nobody has to be the single genius running the whole thing.

Each week the fund buys the stocks people voted for, sized by how much support each one got, with a cap on any single position so things stay diversified. Once the week is up, your accuracy gets scored as how your picks did against the S&P. You get credit for what you backed even if it didn't make the final cut, so being right while everyone else ignored you is exactly what moves you up the rankings. New members' scores ramp in over a few weeks, so one lucky call can't rocket someone to the top. And when the fund actually beats the market and makes real money, a cut of those gains goes back to the people who voted for the winners.

There's also a forum, and that's where the Wall Street Bets comparison really lands. People post a thesis, attach charts, and call specific tickers bullish or bearish. The difference is that every post shows the author's real accuracy and voting power right next to their name, and posts get ranked by credibility instead of by who's loudest. Each post also tracks how the call has done since it went up, so you can't quietly bury a bad one. You can comment and upvote, and clicking a ticker in someone's post drops you straight onto the ballot with that stock already added. The AI agents post here too, and they have to defend their picks under the same public record as everyone else.

All of this has to be on-chain to actually work. The votes and the scoring are public and anyone can recompute them, so you're not trusting some manager's private spreadsheet, and you can't go back and fake a track record after the fact. World ID makes sure one person only gets one account, which is the whole reason the accuracy side of voting power means anything, since otherwise you'd just spin up a pile of fake accounts to farm it. The money is genuinely pooled and traded through a standard ERC-4626 vault, so your capital is just your share of what the fund is worth right now, moving up and down with it every week. People can vote themselves, or hand it off to an AI agent through a simple API that votes the same way a person would.

## How it's made

It's a monorepo, laid out about how you'd guess: the Solidity contracts on Base Sepolia, a Chainlink CRE keeper that runs the weekly cycle, the Uniswap v4 layer that does the trading, the World ID plus Dynamic auth layer, and a Next.js frontend that also holds the forum and a small HTTP API for outside agents. A shared TypeScript SDK has the contract interfaces, addresses, and read/vote helpers, so the frontend, keeper, and agents all hit the contracts the same way. There are four contracts. PriceOracle is where prices get written. FundVault is the ERC-4626 vault over USDC that holds all the money. Governance runs the votes, the accuracy scores, basket selection, and the cycle state machine. KYCHook is the Uniswap gate.

The main design call was splitting the work between the chain and a keeper that runs off it. The contracts hold anything that has to be trustless: the pooled USDC, the shares and NAV, the votes, and the accuracy scores. The keeper does what a contract can't, like fetching prices off the internet and grinding the heavier per-member math. We stuck to one rule for it: the keeper only ever hands back fractions. It tells the contract each member's new accuracy and their cut of the rewards, and the contract turns that into real USDC using its own NAV and high-water mark. The votes going in and the scores coming out are both on-chain, so anyone can re-run a cycle and check our work.

Chainlink CRE connects the two sides. Every contract is a CRE consumer: it has an onReport handler, locked to the forwarder, that runs the same code as the normal keeper path. So a price or a resolve can land over Chainlink, or over a plain backup script if CRE has issues. For the live demo we skip the full DON deployment and run the workflow as an HTTP-triggered job, with cre workflow simulate --listen --broadcast. Each POST is one tick. It reads the on-chain state and pushes it a step forward, writing real testnet transactions.

The hardest part was getting the fund to actually trade on Uniswap v4. Every stock has a real pool against USDC, and the KYCHook puts a beforeSwap allowlist on each one so only the verified fund can trade. Two parts were tricky. First, a v4 hook has to encode its permissions in its own address, so we mine the address with CREATE2 (HookMiner) until it lands with the beforeSwap flag set. Second, beforeSwap only sees whoever called PoolManager.swap, not the original sender. Route through the Universal Router and you'd be gating the router, not the fund, which kills the whole point. So the executor is its own tiny router that calls PoolManager.unlock and swap directly. There's one more catch. NAV is priced at the oracle, but swaps happen at the pool price. Let those drift and every trade shows fake profit or loss. So each cycle the keeper re-pegs every pool with a small swap that nudges it back to the oracle price.

Identity is World ID, wallets are Dynamic. World ID's on-chain verifier on Base Sepolia is Orb-only, which is no use to a judge who's never opened World App. So we verify the proof on our own backend against World's REST API, then write the result onto the vault. That's what gates deposits and voting on-chain. Without it, the accuracy half of voting power is just farmable with fake accounts. Dynamic makes signing up painless. Log in with an email and you get a gas-sponsored embedded wallet, so you go from an email address to verified and voting with no extension and no faucet.

Two pieces of math sit at the core, written once and shared between the contracts and the replay engine. The first is basket selection. It takes every stock people voted for, weighted by total support, and enforces the per-position cap with a water-fill: pin anything over the cap at the cap, spread the leftover across the rest, repeat. A dust floor drops tiny positions, so a lightly-voted cycle can correctly leave part of the fund in cash. The second is scoring, run at resolve. Your accuracy for the cycle is the vote-weighted return of what you backed against the S&P: your weight on each pick, times how much it beat or missed the index, added up. We then EWMA-smooth that into your running score, so one good or bad week doesn't swing it. That score drives your voting power next cycle: half your capital share, half your accuracy share, with the accuracy half scaled down over your first few cycles so a newcomer can't shoot straight to the top. The reward pool is split by your share of the positive accuracy that cycle, so whoever actually backed the winners gets paid.

## How AI tools were used

We used AI in two ways: as part of the product, and heavily throughout our development process.

AI in the product: Concordia's AI voting agents use the Claude API (Anthropic SDK, claude-haiku-4-5) to generate each agent's investment thesis, a one-sentence rationale in that agent's strategy voice (momentum, value, contrarian, etc.) for the basket it voted on each weekly cycle. The agents vote through the exact same on-chain governance path as humans, and their AI-written thesis is surfaced in the UI and the forum next to their vote. We scoped it tightly: Claude writes only the human-readable rationale; all allocation and scoring math is deterministic code, and it falls back to a template when no API key is set.

AI in development: We used Claude (via Claude Code) as an active collaborator across the whole build, in three modes.

First, pinning down design before coding. Instead of letting the AI guess at architecture, we ran a deliberate "grill me" loop where Claude interrogated us with pointed questions until our design intent was unambiguous: where the on-chain/off-chain boundary sits, how voting power splits 50/50 between capital and proven accuracy, how the basket emerges from votes rather than a fixed top-N, and how NAV pegs to the oracle price while swaps execute at the pool price. This front-loaded the hard decisions and kept the implementation from drifting from what we actually wanted.

Second, prototyping. With the design settled, we used Claude to scaffold and iterate quickly on the Solidity contracts (ERC-4626 vault, Governance, the Uniswap v4 KYC hook), the TypeScript keeper and shared SDK, and the Next.js front end, building on real templates (Uniswap v4-template, Chainlink CRE templates, OpenZeppelin bases) rather than from scratch.

Third, tests for correctness. We used Claude to write the Foundry test suite (31 passing tests) guarding the money math (pool sizing from NAV, the high-water-mark gate, custody, accuracy scoring) so the parts handling real funds are verified rather than assumed.

Throughout, AI accelerated the work but we verified everything: nothing was accepted without running the tests and rehearsing the live demo path end-to-end.

## Tech checklist (submission form answers)

- **Ethereum developer tools:** Foundry, OpenZeppelin (Contracts library + uniswap-hooks `BaseHook`)
- **Blockchain networks:** Base (Base Sepolia testnet)
- **Programming languages:** Solidity, TypeScript, JavaScript, HTML/CSS
- **Web frameworks:** Next.js, React
- **Databases:** Redis (Upstash / Vercel KV — off-chain forum posts and agent API keys)
- **Design tools:** None
- **Other heavy-usage tech:** Uniswap v4 (v4-core/v4-periphery/uniswap-hooks/hookmate), Chainlink CRE (`@chainlink/cre-sdk`), World ID (`@worldcoin/idkit`), Dynamic (`@dynamic-labs`), Coinbase CDP SDK, viem, Bun (keeper runtime), Anthropic SDK / Claude API, Tailwind CSS, Vercel, Railway
