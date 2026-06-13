# CRE path runbook (Chainlink prize) — PROVEN

Drive the on-chain state machine (prices + lifecycle + repeg) with the **Chainlink CRE workflow**
instead of the Bun heartbeat, so Chainlink visibly causes on-chain state changes on Base Sepolia.
Each contract has a forwarder-gated `onReport` (ISSUES #C2) that runs the same logic as its
`onlyKeeper` EOA path. **Verified working 2026-06-13** — `cre workflow simulate --broadcast` drove a
real `lockCycle` (gov state → LOCKED) and price/repeg writes on Base Sepolia.

**Heartbeat and CRE never run at the same time** — both advance the cycle. Stop `scripts/run.ts`
before running CRE.

## Two gotchas that cost us hours (read first)

1. **The workflow WASM must be "pure" for QuickJS.** CRE runs the workflow in QuickJS (not Node).
   Any **module-scope** Node/browser API — `process.env`, `fetch`, etc. — is evaluated when the engine
   loads, *before* trigger subscription, and traps with `failed to execute subscribe: wasm
   unreachable`. The `@concordia/shared` barrel re-exports `client.ts` (which reads `process.env.RPC_URL`
   at module scope), so **`workflow.ts` must NOT import `@concordia/shared`** — the pieces it needs
   (tickerToBytes32, encoders, UNIVERSE, computeResolve, etc.) are inlined instead. Keep it that way.
2. **The simulate forwarder is NOT the one in the docs' Forwarder Directory.** The directory lists
   `0xF8344CFd…` for Base Sepolia (that's for a **live DON deploy**). `cre workflow simulate --broadcast`
   broadcasts through a **different** forwarder — for this org it's
   **`0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5`**. The contracts must trust *that* one, or `onReport`
   reverts `NotForwarder` — and the forwarder **swallows the revert** (tx shows status 1 but nothing
   changes on-chain). Discover it by reading the `to` of any CRE write tx (`cast tx <hash> 'to'`).

The trigger is **cron** (`cron-trigger@1.0.0`, stable), not the HTTP trigger (`@1.0.0-alpha`, which is
what `--listen` uses and is buggy in this CLI/SDK combo). So we run one-shot `simulate` ticks, no
`--listen`, no `curl`.

## Addresses (Base Sepolia)

| | |
|---|---|
| PriceOracle (receiver) | `0x65BB0F2C28F6627F89F6190d05ABBAcEF1c65a34` |
| Governance (receiver) | `0x16205875989dC061368A30E7F1B2604D9F5200CF` |
| UniswapExecutor (receiver) | `0x26d8a89d00Bb9F63BfFBd73A11BC249F79935DEf` |
| **Forwarder — `simulate --broadcast`** | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` ← authorize THIS |
| Forwarder — live DON deploy (directory) | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` (re-point if you ever deploy to the DON) |

## Steps

### 1. Config — done
`cre/my-workflow/config.{staging,production}.json` point `oracle`/`governance`/`executor` at the
receiver addresses above (the receivers *are* the contracts — per-contract `onReport`).

### 2. Authorize the simulate forwarder on the 3 contracts
Deployer is keeper (Oracle/Gov) + owner (Executor). From `contracts/` (`set -a; source ../keeper/.env;
set +a` to load `KEEPER_KEY`/`RPC_URL`):
```bash
FWD=0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5
cast send 0x65BB0F2C28F6627F89F6190d05ABBAcEF1c65a34 "setForwarder(address)" $FWD --rpc-url $RPC_URL --private-key $KEEPER_KEY
cast send 0x16205875989dC061368A30E7F1B2604D9F5200CF "setForwarder(address)" $FWD --rpc-url $RPC_URL --private-key $KEEPER_KEY
cast send 0x26d8a89d00Bb9F63BfFBd73A11BC249F79935DEf "setForwarder(address)" $FWD --rpc-url $RPC_URL --private-key $KEEPER_KEY
```
Verify: `cast call <addr> "forwarder()(address)" --rpc-url $RPC_URL` returns the forwarder.

### 3. CLI + login + RPC
- Install the CRE CLI (docs.chain.link/cre), `cre login` once.
- `cre/project.yaml` RPC is **skip-worktree'd** with the CDP URL locally (don't commit the token);
  the committed value is the public node. Public node rate-limits the bursts — use a dedicated RPC.

### 4. Run a tick (from `keeper/cre/`, heartbeat stopped)
```bash
export CRE_ETH_PRIVATE_KEY=$KEEPER_KEY   # cre uses THIS var name (the funded submitter wallet)
cre workflow build    my-workflow --target staging-settings
cre workflow simulate my-workflow --target staging-settings --broadcast
```
Each run = **one tick** = one on-chain step (reads `state()` → does the next job): IDLE → post prices
+ open · OPEN → lock · LOCKED → post next prices + resolve. Run it again to advance the next step.

Add `--engine-logs --verbose` to see the full execution + the real error if anything traps.

### 5. Verify it actually mutated state
```bash
cd keeper && bun run scripts/status.ts          # cycle/NAV should advance
# or: cast call <gov> "state()(uint8)" --rpc-url $RPC_URL   (changes per tick)
```
If state did NOT change but the tx succeeded → `onReport` reverted and the forwarder swallowed it:
re-check step 2 (forwarder address) via `cast tx <writeTxHash> 'to'`.

## Notes
- CRE reads `LAST_FINALIZED_BLOCK`, which trails the head by a few minutes — the cycle id it logs may
  lag the live one. Harmless: the contract acts on its live state; CRE only uses the read to pick the
  next action.
- The simulation succeeding (`Status: SUCCESS`) alone satisfies the Chainlink prize; the on-chain
  writes landing make it the stronger "CRE causes a state change" claim.
- The heartbeat (`scripts/run.ts`, direct `onlyKeeper`) remains the break-glass fallback.
