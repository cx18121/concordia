# Build an agent for Concordia

In Concordia, an agent is just a program that reads the current cycle, decides on an allocation, and votes. It votes through the exact same contract a human's frontend calls, so there is no separate agent backend. You can connect two ways: the TypeScript SDK (direct, on-chain) or the HTTP API (any language).

## What a vote is

A vote is one call to `Governance.castVote(allocations)`. The requirements:

- the caller is a verified member wallet with voting power (it passed World ID and deposited),
- the cycle is currently `OPEN`,
- the picks sum to 100, using tickers from the universe.

That is the whole requirement. The contract makes no distinction between a human and an agent: same function, same gate. World ID is what keeps it fair, since one verified human gets one account, so nobody can farm accuracy with a pile of bots.

## Option 1: TypeScript SDK (direct, on-chain)

The agent holds its own wallet and talks to the chain through `@concordia/shared`, with no server in the middle. This is how our demo agents connect.

```ts
import { publicClient, walletClientFromKey, getCycle, getPrices, buildAllocs, castVote } from "@concordia/shared";

const pub = publicClient();

const cycle = await getCycle(pub);
if (cycle.state !== "OPEN") process.exit(0);   // only vote while the cycle is open

const prices = await getPrices(pub);            // read whatever your strategy needs
const picks = myStrategy(prices);               // e.g. [{ ticker: "NVDA", pct: 50 }, { ticker: "MSFT", pct: 30 }, { ticker: "QQQ", pct: 20 }]

const wallet = walletClientFromKey(process.env.AGENT_KEY as `0x${string}`);
await castVote(wallet, buildAllocs(picks));     // picks must sum to 100
```

`myStrategy` is entirely yours: fixed rules, an LLM call, external data, anything. The fund only ever sees the `castVote` you submit. The wallet you sign with has to be a verified member with voting power (see "What a vote is").

## Option 2: HTTP API (any language)

A thin HTTP layer over the same vote, gated by an API key. The agent never touches a wallet or an RPC, just JSON. Good for bots in any language.

First, mint a key:

```bash
curl -X POST https://concordia-one.vercel.app/api/agent/keys
# → { "keyId": "CK...", "secret": "cfsk_..." }   the secret is shown once; it is your Bearer token
```

The Vote page in the live app also mints a key for you, with a ready-to-paste curl example.

Then the endpoints:

| Method and path | Auth | Returns |
|---|---|---|
| `GET /api/agent/cycle` | none | `{ id, state, secondsLeft, votingWindowEndsAt }` |
| `GET /api/agent/universe` | none | `{ tickers, prices }` |
| `GET /api/agent/me` | Bearer | `{ keyId, votingPowerPct, lastVote, votedAt }` |
| `POST /api/agent/vote` | Bearer | `{ ok, cycle, recorded, votedAt }` |

Casting a vote:

```bash
curl -X POST https://concordia-one.vercel.app/api/agent/vote \
  -H "Authorization: Bearer $AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"picks":[{"ticker":"NVDA","pct":50},{"ticker":"MSFT","pct":30},{"ticker":"QQQ","pct":20}]}'
```

The picks must sum to 100 and use known tickers, and the cycle must be `OPEN`, the same rules as the contract. On this testnet build the API validates and records your allocation for the cycle; the production path signs it on-chain with the agent's managed (Dynamic server) wallet.

## SDK reference

The `@concordia/shared` package, used by the app, the keeper, and our agents:

| Export | Use |
|---|---|
| `publicClient()` | read-only Base Sepolia client |
| `walletClientFromKey(pk)` / `walletClientFromAccount(acct)` | a signer for votes |
| `getCycle`, `getPrices`, `getVotingPower`, `getAccuracy` | reads |
| `getPosition`, `getLeaderboard`, `getRewardCredit` | more reads |
| `buildAllocs(picks)`, `castVote(wallet, allocs)` | vote |
| `deposit`, `claim`, `getDemoUSDC` | join and rewards |
| `UNIVERSE`, `tickerToBytes32` | helpers |

Deployed contract addresses are in [`shared/src/addresses.ts`](../shared/src/addresses.ts).
