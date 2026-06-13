# Community Fund DAO — Design & Parameters

Canonical design doc. The "locked" decisions are settled; the parameters are **named constants** — tunable defaults, not hard truths. Governance can retune them later.

---

## 1. Locked decisions

| Area | Decision | Why |
|---|---|---|
| **Product framing** | Kalshi-style, **human-first**. Agents are optional automation ("an agent is just an automated human") and use the *same* voting path. | Humans are the primary user; agents shouldn't get a special path. |
| **Chain** | **Base Sepolia** (testnet) | Uniswap v4 live + verified there; mature tooling; all 3 sponsors work on it. Arc was the alt (USDC-native + booth) but has no Uniswap. |
| **Sponsors** | **Chainlink** (CRE price/accuracy keeper), **World** (World ID + AgentKit), **Dynamic** (wallets + agent delegation) | Chosen on product fit, not prize size. |
| **Stock assets** | **Mock ERC-20s** we deploy (mockAAPL, mockNVDA…), priced by the on-chain CRE feed, swapped on real Uniswap v4. | No tokenized stocks exist on any usable testnet. On mainnet these slots swap for real Dinari/xStocks tokens — contracts identical. |
| **Price source** | External stock-price **API** = the number. **Chainlink CRE** = the trusted courier that writes it on-chain. They are separate. | Blockchain can't call the internet; CRE brings the price on-chain trustlessly. |
| **Identity** | World ID = one verified human, one account. AgentKit links each agent to a verified human. | Sybil resistance is what makes 50/50 voting fair. |
| **Agents** | We build our own: deterministic strategy + LLM thesis layer. 6 demo agents run a 12-week replay to seed real track records. | Reliable on stage; AI does the narrative, not the decision. |
| **Forum** | **Stretch goal.** Credibility-ranked discussion board: posts wear the author's live on-chain reputation. No "vote-through" amplification math (cut — it double-counted skill). | Visibility does the work, not a fragile formula. |

---

## 2. Tunable parameters (named constants)

These map directly to a Solidity config block. All governance-tunable; values below are demo defaults.

| Constant | Default | Units | Controls | Rationale |
|---|---|---|---|---|
| `CAPITAL_ACCURACY_SPLIT` | 50 / 50 | % | money vs merit in voting power | the headline mechanic; the negotiated truce |
| `EWMA_ALPHA` | 0.25 | ratio | accuracy smoothing speed | one fluke nudges you; a streak moves you |
| `CONFIDENCE_RAMP` | 12 | cycles | how long a new member's accuracy phases in | kills the lucky-newcomer exploit |
| `CYCLE_LENGTH` | 1 | week | length of one investment cycle | — |
| `VOTING_WINDOW` | 24–48 | hours | time to deposit + vote at cycle open (minutes on stage) | participation ↔ time-invested |
| `REWARD_POOL_PCT` | **25%** | % of *alpha* | share of generated alpha redistributed to winning voters | reward-capital ↔ reward-skill dial; 20% is TradFi convention, we run it higher since it's our core incentive |
| `POSITION_CAP_PCT` | **30%** | % of fund | max size of any single position | single-name blowup risk |
| `DUST_FLOOR` | TBD | min $ size | drops micro-positions below this | gas/operational threshold, not a vote threshold |
| `MGMT_FEE` | **0%** | annualized | management fee | dropped for the demo — everything flows back to users |
| `INFLUENCE_CAP` | 2× | multiplier | forum influence cap (stretch only) | anti-gaming if the forum amplification is ever built |

---

## 3. Core mechanics (the clarified logic)

### Weekly cycle — self-contained, no overlap
```
Cycle open ──▶ [ voting window ~24–48h ] ──▶ buy basket ──▶ [ hold ~5d ] ──▶ resolve
                snapshot power +                                              │
                collect votes                                                └─▶ next cycle opens
```
- **Voting is at the cycle OPEN**, not throughout the week.
- **Capital is epoch-locked:** deposits made mid-cycle are *queued* and activate at the next open. (Anti-gaming: no flash-deposit to swing a vote you're already in.)
- A vote cast at open resolves one cycle later. **You never vote on the next cycle before the current one resolves** — each boundary resolves the old and opens the new atomically.
- Fund sits in cash during the voting window (resolve → sell to cash → vote → buy). Tiny drag, dead simple.

### Voting power
```
VP(i) = 0.5 · CapitalShare(i) + 0.5 · [ AccuracyShare(i) · confidence(i) ]
CapitalShare(i)  = USDC_value(i) / Σ USDC_value
AccuracyShare(i) = max(acc(i),0) / Σ max(acc(j),0)        // negatives floored to 0
confidence(i)    = min(cycles_participated(i) / CONFIDENCE_RAMP, 1)
```
Snapshotted at cycle open. Peer-relative, sums to 1.

### Accuracy
- **Vote-weighted excess return vs the S&P**, per cycle: Σ over backed stocks of (your weight on it × (its return − S&P)).
- **Paper basis** — credited for what you *backed*, even picks that lost the vote. Being right while outvoted is what lifts you.
- **EWMA-smoothed**: `newAcc = α·thisCycle + (1−α)·oldAcc`, α = `EWMA_ALPHA`.
- Computed off-chain by CRE, written to the on-chain Reputation store.

### Selection — emerges from votes, not a fixed count
> Hold every voted stock **in proportion to its vote weight**, subject to two risk rails:
> - **`POSITION_CAP_PCT`** max per position (diversification), renormalized
> - **`DUST_FLOOR`** minimum size (anti-dust)
>
> The number of holdings emerges from the votes — no top-N, no magic threshold.

### Fees & rewards
- **No management fee** for the demo (`MGMT_FEE = 0`).
- **Success reward**: `REWARD_POOL_PCT` of the **alpha** (return above S&P), charged **only when the fund sets a new high vs the benchmark** (high-water mark — never double-charges recovered ground).
- The pool is **redistributed to winning voters**, not taken by a manager.
- The other (1 − `REWARD_POOL_PCT`) of alpha + all beta + principal **accrues to NAV** for all shareholders by share ownership.

### Reward attribution — the votes are the record
1. Voting contract stored each member's allocation.
2. At resolve, CRE posts each stock's return → contract computes each stock's alpha.
3. Each member's **realized-alpha credit** = Σ (their power on stock × that stock's alpha).
4. Pool split **pro-rata to positive credit**. Backing losers earns 0 from the pool (no extra punishment there) but **drops your accuracy** → lower future voting power.
5. Credited as **claimable USDC** (or auto-minted shares); visible on the dashboard, pulled via `claimRewards`.

### Withdrawal — separate from resolve
- Resolve does **not** pay wallets. Gains accrue to **NAV** (your shares are worth more).
- To cash out: **redeem shares** for USDC at a cycle boundary (capital epoch-locked). ERC-4626 handles share↔asset accounting; the fund unwinds positions to USDC as needed.

---

## 3.5 Demo mode vs production mode — a config flag, not a fork

The system is real end-to-end (contracts, votes, accuracy, swaps, identity); only the **inputs** differ by mode:

| | Demo | Production |
|---|---|---|
| `CYCLE_LENGTH` | 5 min | 1 week |
| Price source | `ReplayFixtureSource` — real 2024 weekly history, looped | `LiveAPISource` |
| USDC | mock | real USDC |
| Stock tokens | mocks | Dinari/xStocks (identical interfaces — drop-in) |

Why replayed history instead of live prices in demo: stocks move ~0.01% in 5 real minutes — no differentiation, dead leaderboard. Each fast cycle must represent a real *week* of movement for skill to visibly emerge. The UI displays this honestly (demo-mode badge: "replaying week of Feb 12, 2024 at ~2000×"); the pitch shows the config diff as proof that judges used the production system.

## 4. Deferred / stretch

- **Forum** (credibility-ranked board + on-chain reputation badges + live pitch P&L) — stretch; prototype built (`forum-prototype.html`).
- **Forum influence amplification** — cut (double-counted skill). If revived, use a *separate* Influence score, never folded into Accuracy.
- **Skill-weighted sentiment**, **vote-through attribution tag** — nice-to-haves.
- **ERC-8004 ReputationRegistry** — could store accuracy on-chain in the standard registry instead of a custom mapping; for 36h a simple mapping is fine.

---

## 5. Contracts (logical → likely merged for 36h)

| Logical contract | Holds | Likely merge |
|---|---|---|
| Vault (ERC-4626) | USDC, shares | + Fees & Rewards |
| Voting | votes, power snapshot | + Reputation |
| Reputation | accuracy scores | (into Voting) |
| Portfolio | basket, NAV | standalone or + Vault |
| Fees & Rewards | reward pool, HWM | (into Vault) |

Off-chain: Chainlink CRE keeper (prices, PnL, accuracy) · Agent Runtime (strategy + LLM thesis).

*Next step: turn this into the actual contract set — state, functions, call graph.*
