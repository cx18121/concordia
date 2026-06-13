# contracts — Solidity (Foundry)

Workstreams A + B (`../docs/ROADMAP.md`). Spec: `../docs/CONTRACTS.md` — PriceOracle, FundVault (ERC-4626), Governance, KYCHook, mock stock ERC-20s.

**Not yet initialized** — Foundry isn't installed on the scaffold machine, and the v4-template init is interactive enough that the contracts owner should run it themselves (Phase 0):

```sh
# 1. install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# 2. from the repo root: replace this stub with the Uniswap v4 template
rm -rf contracts
forge init -t Uniswap/v4-template contracts
rm -rf contracts/.git   # the template clones with its own .git — we're a monorepo

# 3. first task: transcribe the interfaces from docs/CONTRACTS.md
#    (IPriceOracle, IFundVault, IGovernance, IUniswapExecutor) and commit the ABIs —
#    that freeze is what lets all five workstreams run in parallel.
```

Base Sepolia v4 addresses (verified, see docs/CONTRACTS.md): PoolManager `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408`. KYCHook needs CREATE2 address-mining (`HookMiner` ships in the template) — do it first; it blocks all swap testing.
