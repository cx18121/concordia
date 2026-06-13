# bot-api — programmatic voting for bots & agents

The backend behind the **"API keys"** panel in the Vote UI. A user generates an Alpaca-style
key + secret, hands it to their own bot/agent, and the bot votes programmatically through the
**exact same `Governance.castVote` path a human uses**.

Keys are **vote-only** — they can never deposit or withdraw. The secret is shown once at
generation; only its hash is stored. Revocation lives in Settings.

## Run it

```bash
npm install
npm run dev          # http://localhost:8787
npm run demo         # in another shell — exercises the whole flow
npm run typecheck
```

## Auth (Alpaca-style)

Every authenticated request sends:

```
APCA-API-KEY-ID:     <keyId>
APCA-API-SECRET-KEY: <secret>
```

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/v1/keys` | admin | Issue a key (the UI's "Generate new keys" button calls this server-side after World ID verify). Returns the secret **once**. |
| `DELETE` | `/v1/keys/:keyId` | admin | Revoke a key. |
| `GET` | `/v1/clock` | — | Cycle number, phase (`OPEN`/`LOCKED`), countdowns. |
| `GET` | `/v1/universe` | — | Tradable assets + current prices. |
| `GET` | `/v1/account` | key | The bot's member account: balance, shares, voting power, accuracy, claimable. |
| `GET` | `/v1/cycle` | key | Current cycle + the bot's latest vote. |
| `POST` | `/v1/votes` | key (vote) | Submit an allocation. Weights are bps and must sum to `10000`. Rejected unless the cycle is `OPEN`. |

### Submit a vote

```bash
curl -X POST http://localhost:8787/v1/votes \
  -H "APCA-API-KEY-ID: $KEY_ID" \
  -H "APCA-API-SECRET-KEY: $SECRET" \
  -H "content-type: application/json" \
  -d '{"allocations":[
        {"asset":"mNVDA","weightBps":4000},
        {"asset":"mMSFT","weightBps":3500},
        {"asset":"mAAPL","weightBps":2500}
      ]}'
```

Validation enforces: known assets only, no duplicates, each `weightBps` in `1..10000`,
sum exactly `10000`, ≤8 assets, and cycle must be open.

## Layout

| File | What it is |
|---|---|
| `src/server.ts` | Express app + all routes |
| `src/auth.ts` | `APCA-API-*` header auth middleware + scope guard |
| `src/keys.ts` | key issue/verify/revoke; in-memory store behind a `KeyStore` interface (swap for a DB) |
| `src/governance.ts` | vote validation + `castVote` adapter (`LocalGovernance` sim / `OnChainGovernance` stub) |
| `src/state.ts` | cycle clock + market/account snapshots (swap for Governance/PriceOracle/Vault reads) |
| `src/universe.ts` | mock stock tickers + `bytes32` asset encoding |
| `src/demo-client.ts` | end-to-end example bot |

## Status (honest)

Runs standalone today against **mocks**: an in-memory key store, an in-process cycle clock, and a
`LocalGovernance` sim instead of real `castVote`. Every mock sits behind an interface with the
swap-in point marked:

1. **Keys** → back `KeyStore` with Postgres/Redis; hash secrets with scrypt/bcrypt (currently sha256).
2. **Votes** → flip `LocalGovernance` → `OnChainGovernance`; sign with the member's Dynamic server
   wallet bound to the key, call `Governance.castVote` on Base Sepolia.
3. **Reads** (`/clock`, `/universe`, `/account`) → read Governance + PriceOracle + Vault views.

The API surface and validation are real — bots can build against it now; only the data source changes.
