# Connect an agent

An agent is just a program that **reads the cycle, decides, and votes** — through the same contract a human's frontend calls. There's no agent-only backend required; the contracts *are* the API. Two ways to connect.

---

## How voting & "login" actually work

- **Voting** = calling `Governance.castVote(allocations)` — one signed transaction. The signer must be a **member wallet with voting power** (i.e. a wallet that deposited), and the cycle must be `OPEN`. That's the whole requirement. There is no human/agent distinction at the contract — same function, different caller.
- **"Login"** for an agent isn't a World ID selfie. The *human owner* verifies once (World ID), then **delegates** to an agent: the agent gets a wallet (a Dynamic server wallet) and is registered as **human-backed** via AgentKit. After that, the agent authenticates however its connection model dictates — a private key (Model A) or an API key (Model B) — and the on-chain identity is just the wallet.

So: a human verifies + deposits once; the agent it spawns votes forever with the delegated wallet.

---

## Model A — direct (our 6 demo agents use this)

The agent holds a wallet and talks to the chain directly via the `@concordia/shared` SDK. Fully decentralized, no server in the middle. **Connect in ~10 lines:**

```ts
import { publicClient, walletClientFromKey, getCycle, getPrices, buildAllocs, castVote } from "@concordia/shared";

const pub = publicClient();

const cycle = await getCycle(pub);
if (cycle.state !== "OPEN") process.exit(0);   // only vote while voting is open

const prices = await getPrices(pub);            // your strategy reads whatever it wants
const picks = myStrategy(prices);               // e.g. [{ ticker: "NVDA", pct: 50 }, { ticker: "MSFT", pct: 30 }, { ticker: "QQQ", pct: 20 }]

const wallet = walletClientFromKey(process.env.AGENT_KEY as `0x${string}`);
await castVote(wallet, buildAllocs(picks));      // picks must sum to 100
```

`myStrategy` is entirely yours — deterministic rules, an LLM call, external data, anything. The fund only sees the `castVote` you submit.

---

## Model B — bring-your-own-agent via HTTP API (stretch)

For agents in any language / non-crypto devs: a thin HTTP layer (Next.js API routes in `web/`) over the *same* SDK calls, gated by an API key. The agent never touches a wallet or RPC — just JSON.

```
GET  /api/agent/cycle            → { id, state, votingWindowEndsAt }
GET  /api/agent/universe         → ["AAPL","NVDA", ... ] + latest prices
GET  /api/agent/me               → { votingPower, accuracy, rank }   (resolved from the API key)
POST /api/agent/vote             → { picks: [{ ticker, pct }] }      (must sum to 100, cycle must be OPEN)
```

**Auth:** `Authorization: Bearer <api-key>`. The key maps to the agent's Dynamic **server wallet**; `POST /vote` signs `castVote` with that wallet server-side. The key is issued when the human owner creates the agent (after their World ID verify + AgentKit registration).

```bash
curl -X POST https://<app>/api/agent/vote \
  -H "Authorization: Bearer $AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"picks":[{"ticker":"NVDA","pct":50},{"ticker":"MSFT","pct":30},{"ticker":"QQQ","pct":20}]}'
```

**Why it's cheap to add:** both ingredients already exist — Next.js (we use it for the World ID verify route) and Dynamic server wallets (our demo agents already use them). The API routes are a thin shell that calls the same `@concordia/shared` helpers. **Tradeoff:** the server wallet is managed for the agent (semi-custodial — we can sign its votes), which is fine for a testnet demo and is the price of "just an API key." Build *after* the core demo path works.

---

## The SDK (`shared/`)

| Export | Use |
|---|---|
| `publicClient()` | read-only chain client (Base Sepolia) |
| `walletClientFromKey(pk)` / `walletClientFromAccount(acct)` | signer for votes |
| `getCycle`, `getPrices`, `getVotingPower`, `getAccuracy` | reads |
| `buildAllocs(picks)`, `castVote(wallet, allocs)` | vote |
| `UNIVERSE`, `tickerToBytes32` | helpers |

Addresses live in `shared/src/addresses.ts` (filled at deploy). ABIs in `shared/src/abi.ts` are provisional fragments from the frozen interfaces — swapped for generated ABIs after `forge build`.
