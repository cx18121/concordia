# contracts — Solidity (Foundry + Uniswap v4-template)

Workstreams A + B (`../docs/internal/ROADMAP.md`). Spec: `../docs/CONTRACTS.md`. Frozen cross-workstream interfaces in `src/interfaces/` — change only by team agreement + an ISSUES.md note.

## Setup (after clone)

Dependencies (`lib/`, ~90MB) are **gitignored** — restore them, then build:

```sh
./setup.sh      # restores lib/ from the v4-template (one-time)
forge build     # compiles src/ (interfaces + your contracts)
forge test
```

Foundry itself: `curl -L https://foundry.paradigm.xyz | bash && foundryup`, then make sure `~/.foundry/bin` is on your PATH.

## Layout

- `src/interfaces/` — **frozen** interfaces (IPriceOracle, IFundVault, IGovernance, IUniswapExecutor)
- `src/Counter.sol` — template example hook; **delete when you add real contracts**
- `script/`, `test/` — template examples (`00_DeployHook`, `03_Swap`, hook tests) — useful references for B's hook + swap work
- Base Sepolia Uniswap v4: PoolManager `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408`. KYCHook needs CREATE2 address-mining (`HookMiner`) — do it first, it blocks all swap testing.

## Build order (A + B)

mock ERC-20s → PriceOracle → FundVault (deposit/NAV) → Governance (vote/snapshot/select) → pools + KYCHook → swaps. Compiles green now; build on top.
