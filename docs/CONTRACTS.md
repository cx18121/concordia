# Contract Design — build-ready spec

**Decisions locked:** real Uniswap v4 execution · CRE computes per-member scoring off-chain, contract owns all money state (Option B hybrid) · 3 contracts. Chain: Base Sepolia.

Scales used everywhere: prices `E8` (8-dp USD), weights/percentages `bps` (1e4 = 100%), accuracy `E4` (signed). No floats on-chain.

---

## 0. The pieces

**Contracts we write (3):**
1. **PriceOracle** — CRE's on-chain mailbox for stock prices + S&P.
2. **FundVault** (ERC-4626) — money: custody, shares, NAV, positions, reward pool, claims, Uniswap swaps.
3. **Governance** — rules: votes, power snapshot, accuracy store, selection, cycle lifecycle.

**Custom but small:**
4. **KYCHook** — Uniswap v4 `beforeSwap` allowlist (gates the tokenized-stock pools to the verified Vault).

**Reused / external:**
- Mock stock ERC-20s (OZ ERC20, we mint + seed) — `mockAAPL`, `mockNVDA`, …
- Uniswap v4 on Base Sepolia: PoolManager `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408`, Universal Router, PositionManager, V4Quoter (see system-design doc)
- World ID Router (verify proofs) · Dynamic (off-chain wallets) · Chainlink CRE (off-chain keeper)
- Start from `v4-template` for pools/hook/router scaffolding.

---

## 1. On / off-chain boundary (Option B hybrid)

```
CRE (off-chain) ──┐
  • fetch stock prices from API          ──▶ PriceOracle.setPrices()        (on-chain)
  • re-peg each Uniswap pool ≈ oracle     ──▶ small swap                      (on-chain)
  • compute per-member: newAccuracy, creditWeightBps   (the float/loop-heavy part)
                                          ──▶ Governance.resolveCycle(...)    (on-chain)
On-chain (contract owns all MONEY state):
  • NAV, fund return, fund excess vs S&P, HWM gate
  • reward-pool SIZE in USDC, the split application, custody, claims
  • votes, power snapshot, selection, the Uniswap swaps
```

> **Rule:** CRE provides *who-gets-what-fraction* and *new scores*. The contract decides *how much USDC* and *moves the money*. Inputs (votes) and outputs (scores) are both on-chain → fully recomputable/auditable.

---

## 2. PriceOracle

```solidity
state:
  address keeper;                              // CRE
  mapping(bytes32 => uint256) priceE8;         // asset symbol -> price
  uint256 benchmarkE8;                         // S&P 500 level
  uint256 lastUpdate;

setPrices(bytes32[] assets, uint256[] pricesE8, uint256 spE8)   onlyKeeper
price(bytes32 asset) view returns (uint256)
benchmark() view returns (uint256)
```
Trivial. The only thing CRE writes prices into. Read by Vault (NAV) and Governance (selection sanity / fund excess).

---

## 3. FundVault  (ERC-4626 base)

```solidity
immutable: USDC, oracle, universalRouter;
set-once:  governance;                          // wiring

state:
  mapping(address => bool)    verified;         // World ID gate
  bytes32[]                   heldAssets;       // current basket symbols
  mapping(bytes32 => address) tokenOf;          // symbol -> mock ERC20
  mapping(address => uint256) rewardCredit;     // claimable USDC per member
  uint256                     rewardPool;       // USDC reserved for rewards
  int256                      hwmExcessE4;      // cumulative excess-return high-water mark
  int256                      cumExcessE4;      // running cumulative excess return
  uint256                     navAtLock;        // NAV snapshot at cycle lock
  uint256                     benchAtLock;      // benchmark at cycle lock

// ---- users ----
verify(bytes proof, ...)                        // World ID -> verified[msg.sender] = true
deposit(uint256 assets) returns (uint256 shares)    // require verified; 4626 mint at NAV
requestWithdraw(uint256 shares)                 // queue to next boundary
withdraw()                                      // process queued -> USDC
claimRewards()                                  // transfer rewardCredit[msg.sender]

// ---- views ----
totalAssets() = USDC.balanceOf(this) - rewardPool
              + Σ_heldAssets  IERC20(tokenOf[a]).balanceOf(this) * oracle.price(a) / 1e8
              // NAV marks holdings at ORACLE price (real stock price), not pool price

// ---- onlyGovernance ----
executeBasket(bytes32[] assets, uint256[] weightsBps)   // swap deployable USDC -> tokens via Uniswap
closePositions()                                        // swap all tokens -> USDC (to cash)
settle(int256 cycleExcessE4, address[] members, uint256[] creditWeightBps)
    // 1. cumExcessE4 += cycleExcessE4
    // 2. if cumExcessE4 > hwmExcessE4:
    //        gainUSDC   = realized excess gain this cycle (from navAtLock + benchmark)
    //        poolUSDC   = gainUSDC * REWARD_POOL_PCT / 1e4
    //        rewardPool += poolUSDC
    //        for i: rewardCredit[members[i]] += poolUSDC * creditWeightBps[i] / 1e4
    //        hwmExcessE4 = cumExcessE4
recordLock(uint256 nav, uint256 bench)          // store navAtLock / benchAtLock at lockCycle
```

Money trust stays here: only Governance can move the basket or fund rewards; the pool size is computed from the Vault's *own* NAV, never from a number the keeper hands it.

---

## 4. Governance  (Voting + Reputation)

```solidity
immutable: vault, oracle, keeper;

enum State { IDLE, OPEN, LOCKED }
struct Alloc { bytes32 asset; uint16 weightBps; }

state:
  State    state;
  uint256  cycleId;
  address[] members;                            // everyone who has joined (snapshot loop)
  mapping(address => bool) isMember;

  // reputation (written by CRE at resolve)
  mapping(address => int256)  accuracyE4;
  mapping(address => uint256) cyclesParticipated;

  // power snapshot (set at openCycle)
  mapping(address => uint256) powerSnapE4;
  uint256                     totalPowerE4;

  // votes (current cycle)
  address[]                          voters;
  mapping(address => Alloc[])        allocOf;
  mapping(bytes32 => uint256)        assetWeightE4;
  bytes32[]                          votedAssets;

  // tunable constants (governance-settable)
  uint16 CAPITAL_BPS    = 5000;   // 50%
  uint16 ACCURACY_BPS   = 5000;   // 50%
  uint16 EWMA_ALPHA_BPS = 2500;   // 0.25
  uint16 CONFIDENCE_CYCLES = 12;
  uint16 POSITION_CAP_BPS  = 3000;// 30%
  uint16 REWARD_POOL_PCT   = 2500;// 25% of alpha  (read by Vault.settle)
  uint256 DUST_FLOOR_USDC;        // min position size

// ---- lifecycle (CRE-triggered; or time-gated) ----
openCycle()  onlyKeeper (state==IDLE):
    for m in members:
        cap  = vault.balanceOf(m) ... -> capitalShareE4
        acc  = max(accuracyE4[m],0); conf = min(cyclesParticipated[m]/CONFIDENCE_CYCLES, 1)
        accShareE4 = acc/Σacc * conf
        powerSnapE4[m] = (CAPITAL_BPS*capitalShareE4 + ACCURACY_BPS*accShareE4)/1e4
    reset votes; state = OPEN

castVote(Alloc[] allocations) external (verified & isMember & state==OPEN):
    require Σ weightBps == 1e4;                  // spread your power across picks
    store allocOf[msg.sender]; add to voters;
    for each: assetWeightE4[asset] += powerSnapE4[msg.sender] * weightBps / 1e4

lockCycle()  onlyKeeper (state==OPEN):
    (assets, weights) = selectBasket();
    vault.executeBasket(assets, weights);
    vault.recordLock(vault.totalAssets(), oracle.benchmark());
    state = LOCKED

resolveCycle(address[] members_, int256[] newAccuracyE4, uint256[] creditWeightBps)
    onlyKeeper (state==LOCKED):
    int256 excess = fundExcessE4();              // (NAVnow/navAtLock) - (benchNow/benchAtLock)
    vault.settle(excess, members_, creditWeightBps);
    vault.closePositions();
    for i: accuracyE4[members_[i]] = newAccuracyE4[i]; cyclesParticipated[members_[i]]++;
    cycleId++; state = IDLE

// ---- internal ----
selectBasket() returns (bytes32[], uint256[]):
    total = Σ assetWeightE4;
    for a in votedAssets:
        w = assetWeightE4[a] * 1e4 / total;       // proportional to votes
        if (value(w) < DUST_FLOOR_USDC) drop;     // anti-dust
        if (w > POSITION_CAP_BPS) w = POSITION_CAP_BPS;  // cap
    renormalize remaining to sum 1e4;             // count EMERGES from votes

// ---- views (forum + UI read these) ----
votingPower(address) · accuracyOf(address) · confidenceOf(address)
```

`selectBasket` is the one heavier on-chain loop, but it's over `votedAssets` (≤ universe size ≈ 20) — cheap.

---

## 5. Cycle state machine + call graph

```
IDLE ──openCycle()──▶ OPEN ──lockCycle()──▶ LOCKED ──resolveCycle()──▶ IDLE ─┐
        ▲  (snapshot power)   (select+swap in)        (score+pay+swap out)    │
        └─────────────────────────── next cycle ──────────────────────────────┘

USERS:   Vault.deposit / requestWithdraw / withdraw / claimRewards
         Governance.castVote                                  (during OPEN)
CRE:     Oracle.setPrices  +  pool re-peg swaps
         Governance.openCycle / lockCycle / resolveCycle
GOV→VAULT: executeBasket (lock) · recordLock (lock) · settle + closePositions (resolve)
READS:   Gov→Vault (share balances→capital share) · Gov→Oracle (fund excess)
         Vault→Oracle (NAV)
```

Access: lifecycle fns are `onlyKeeper` (the CRE address) for the demo. Optional hardening: make them time-gated + permissionless so anyone can advance the cycle after the window — more trustless, easy add later.

---

## 6. The CRE workflow (off-chain, per cycle)

CRE runs on a schedule (or is triggered). One workflow, three jobs:

1. **Post prices** — fetch stock + S&P prices from the API → `Oracle.setPrices()`.
2. **Re-peg pools** — for each held asset, do a small swap so the Uniswap pool price ≈ oracle price. *(CRE plays the arbitrageur role real markets play on mainnet — keeps swaps honest so pool price never drifts from reality.)*
3. **Resolve** — read on-chain votes + posted prices; compute per member:
   - `newAccuracyE4` = EWMA( vote-weighted excess return of what they backed )
   - `creditWeightBps` = their share of the cycle's total *positive* realized-alpha credit
   then call `Governance.resolveCycle(members, newAccuracy, creditWeight)`.

Everything money-related (pool size, HWM, custody, the actual USDC split) is done by the contract in `settle()`. CRE only supplies the per-member arithmetic.

**CRE write mechanics (verified 6/12):** the contract CRE writes to (here Governance, via `resolveCycle`) is a **consumer** that implements `IReceiver.onReport(bytes metadata, bytes report)`; CRE delivers through Chainlink's fixed `KeystoneForwarder` (managed infra — you don't configure its address in the workflow, but the consumer should access-control on it, and the sim vs production forwarder are different contracts). **Build entirely in CLI simulation** (`cre workflow simulate`) — secrets live in a local `.env`, no access needed, and **simulation alone qualifies for the prize**. Live deploy (optional) = add a `production` target + push secrets to the Vault DON (`cre secrets create`) + `cre workflow deploy` & `activate` via the **private registry** (no wallet/gas). The code is identical sim↔live; the only real gate is Early Access approval — request early (ISSUES #5), or let Chainlink deploy your sim for you.

---

## 7. Uniswap execution layer

- **Mock tokens:** one OZ ERC-20 per stock; we hold mint rights so we can seed pools generously.
- **Pools:** one `mockX / USDC` v4 pool per asset, created via PoolManager, seeded via PositionManager. Hook attached = `KYCHook`.
- **KYCHook (`beforeSwap`):** allowlist gate. Since *only the fund swaps* (members vote, the fund trades collectively), the hook allowlists the **`UniswapExecutor`** (the fund's swap arm). Story: "tokenized-stock pools enforce on-chain compliance — only a verified, KYC'd fund can trade them," and the fund is verified because every depositor passed World ID. Deploy needs CREATE2 address-mining (`HookMiner` from v4-periphery) so the hook address encodes the `beforeSwap` flag. Only `beforeSwap` is set, so pool seeding (add-liquidity) is ungated.
- **Swaps:** `executeBasket` / `closePositions` call `UniswapExecutor.swap{Usdc↔Token}`, which calls `PoolManager.unlock`→`swap` **directly** and settles from its own balance — the executor is its own minimal router, no external router / Permit2. *(Why not Universal Router: `beforeSwap.sender` is the caller of `PoolManager.swap`; routing through a shared router makes the hook gate the router, not the fund — so the executor must be the direct caller for the allowlist to mean anything. See ISSUES #14.)* `repeg` uses the same direct path with a sqrtPrice limit to nudge a pool exactly to the oracle price.
- **Valuation:** swaps *execute* at pool price; NAV + accuracy *value* at oracle price. The CRE re-peg (step 2 above) keeps the two aligned so the swap isn't a source of phantom P&L.

---

## 8. World ID

- `Vault.verify(proof)` validates against the World ID Router and sets `verified[msg.sender]`. Store the nullifier hash to enforce one-human-one-account.
- `deposit` and `castVote` require `verified`. (Agents: backed-by-human via AgentKit off-chain; their wallet still calls `verify` through the human's proof / delegated flow.)
- The KYCHook and `verified` mapping can share the same allowlist source.

---

## 9. Key formulas (recap, on-chain unless noted)

```
VotingPower(i)   = (CAPITAL_BPS·capShare(i) + ACCURACY_BPS·accShare(i)·conf(i)) / 1e4      [on-chain, openCycle]
capShare(i)      = shares(i) / totalShares
accShare(i)      = max(acc(i),0) / Σ max(acc(j),0)
conf(i)          = min(cyclesParticipated(i) / CONFIDENCE_CYCLES, 1)

CycleAccuracy(i) = Σ_assets weight(i,a) · (return(a) − sp)                                 [off-chain, CRE]
newAcc(i)        = α·CycleAccuracy(i) + (1−α)·oldAcc(i)                                    [off-chain, CRE]

basketWeight(a)  = clamp( votes(a)/Σvotes , dust, CAP ) then renormalize                   [on-chain, lock]

fundExcess       = NAVnow/navAtLock − benchNow/benchAtLock                                 [on-chain, resolve]
rewardPool$      = realizedExcessGain$ · REWARD_POOL_PCT   (only if new HWM)               [on-chain, settle]
reward(i)        = rewardPool$ · creditWeightBps(i)                                        [on-chain, settle]
creditWeight(i)  = posAlphaCredit(i) / Σ posAlphaCredit(j)                                 [off-chain, CRE]
```

---

## 10. Build order (within contracts) + risks

**Order:** mock ERC-20s → PriceOracle → FundVault (deposit/withdraw/NAV) → Governance (vote/snapshot/select) → Uniswap pools + KYCHook → executeBasket/closePositions → CRE keeper (prices → resolve) → World ID gate → claims/rewards.

**Risks to watch:**
- **CREATE2 hook mining** — get it working early; it blocks all swap testing.
- **Pool ↔ oracle drift** — the CRE re-peg must work or NAV gets noisy; have a fallback that just values at oracle and tolerates the gap.
- **Snapshot loop bound** — `openCycle` loops members; fine for demo N, but cap it.
- **Fixed-point** — even though heavy math is off-chain, watch bps rounding in `settle`/`selectBasket` (div-by-zero when totalPower or Σvotes = 0 → guard with an empty-cycle path).
- **Keeper as single trigger** — acceptable for demo; note the time-gated-permissionless upgrade.

---

*Next: scaffold the repo (Foundry + v4-template) and start with mock tokens + PriceOracle + Vault deposit/NAV.*
