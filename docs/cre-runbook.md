# CRE path runbook (Chainlink prize)

Switch the live driver from the Bun heartbeat to the **Chainlink CRE workflow**, so Chainlink
visibly drives the on-chain state machine (prices + lifecycle + repeg) via DON reports. The contracts
are already built for this — each has a forwarder-gated `onReport` (ISSUES #C2) that runs the same
logic as the `onlyKeeper` EOA path. The heartbeat stays as the break-glass fallback.

**Heartbeat and CRE are never live at the same time** — they'd both try to advance the cycle. Stop
the heartbeat (`scripts/run.ts`) before running CRE. The seeder (`scripts/seed-demo.ts`) can keep
running to cast votes against whichever driver is live.

## Addresses (Base Sepolia)

| | |
|---|---|
| PriceOracle (receiver) | `0x65BB0F2C28F6627F89F6190d05ABBAcEF1c65a34` |
| Governance (receiver) | `0x16205875989dC061368A30E7F1B2604D9F5200CF` |
| UniswapExecutor (receiver) | `0x26d8a89d00Bb9F63BfFBd73A11BC249F79935DEf` |
| **KeystoneForwarder** | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |

The forwarder is Chainlink's published forwarder for `ethereum-testnet-sepolia-base-1` (Forwarder
Directory). `cre workflow simulate --broadcast` writes through it; it calls our `onReport`.

## Steps

### 1. Config — DONE
`cre/my-workflow/config.{staging,production}.json` already point `oracle`/`governance`/`executor` at
the receiver addresses above (the receivers *are* the contracts — per-contract `onReport`).

### 2. Authorize the forwarder on the 3 contracts
The deployer is keeper (Oracle/Gov) and owner (Executor), so it can set all three. Run from `contracts/`:
```bash
FWD=0xF8344CFd5c43616a4366C34E3EEE75af79a74482
cast send 0x65BB0F2C28F6627F89F6190d05ABBAcEF1c65a34 "setForwarder(address)" $FWD --rpc-url base_sepolia --private-key $PK
cast send 0x16205875989dC061368A30E7F1B2604D9F5200CF "setForwarder(address)" $FWD --rpc-url base_sepolia --private-key $PK
cast send 0x26d8a89d00Bb9F63BfFBd73A11BC249F79935DEf "setForwarder(address)" $FWD --rpc-url base_sepolia --private-key $PK
```
Verify: `cast call <addr> "forwarder()(address)" --rpc-url base_sepolia` returns the forwarder.

### 3. Install the CRE CLI + log in
```bash
# install per docs.chain.link/cre (CLI ≥ v1.19 for --listen)
cre login            # one-time; CRE account (ISSUES #5)
```

### 4. Fund the CRE submitter wallet
`cre workflow simulate --broadcast` signs the forwarder tx with a keeper wallet — set
`CRE_ETH_PRIVATE_KEY` to a funded Base Sepolia wallet (the deployer is fine; it already has ETH).

### 5. Stop the heartbeat, build + run CRE
```bash
# stop scripts/run.ts first (Ctrl-C) — only one driver at a time
cd keeper/cre
cre workflow build  my-workflow --target staging-settings           # → binary.wasm (offline, no auth)
cre workflow simulate my-workflow --target staging-settings --listen --broadcast
```
`--listen` keeps the simulator alive on `http://localhost:2000/trigger`.

### 6. Drive it (each POST = one tick = advance the state machine one step)
```bash
curl -s -X POST http://localhost:2000/trigger          # IDLE→post prices+open, OPEN→lock, LOCKED→resolve
# or a loop for always-on:
while true; do curl -s -X POST http://localhost:2000/trigger; sleep 60; done
```
Watch `scripts/status.ts` (read-only) — prices/cycle/leaderboard should move, now driven by Chainlink.

## Reliability note
`cre/project.yaml` uses the public `sepolia.base.org` RPC (committed, no token). The public node
rate-limited the heartbeat under bursts — for a smooth CRE run, swap that URL **locally** for your
CDP/Alchemy endpoint (don't commit the token).

## If the first write reverts
- `NotForwarder` → the sim used a different forwarder than `0xF834…`. Read the failed tx's caller
  (the address that called `onReport`) and re-run step 2 `setForwarder` with that address.
- Forwarder reverts before `onReport` → report-signature/DON mismatch; confirm `cre login` + target,
  and that you're on `staging-settings`. The **heartbeat is the fallback** — flip back to it for the
  demo if CRE misbehaves.
