# contracts — Solidity (Foundry)

Workstreams A + B (`../docs/ROADMAP.md`). Spec: `../docs/CONTRACTS.md` — PriceOracle, FundVault (ERC-4626), Governance, KYCHook, mock stock ERC-20s.

**The interfaces are already frozen** in `src/interfaces/` (`IPriceOracle`, `IFundVault`, `IGovernance`, `IUniswapExecutor` — see that folder's README). Every workstream imports those today; don't wait on Foundry to start.

**Foundry not yet initialized** (wasn't installed on the scaffold machine). Contracts owner does this in Phase 0 — **note the `src/interfaces/` files must survive the init, so don't `rm -rf contracts`:**

```sh
# 1. install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# 2. init the v4-template into a temp dir, then copy its scaffolding in
#    WITHOUT clobbering our existing src/interfaces/ and README files
forge init -t Uniswap/v4-template /tmp/v4t
rm -rf /tmp/v4t/.git
cp -rn /tmp/v4t/. ./        # -n = don't overwrite existing files (keeps our interfaces)
cp /tmp/v4t/foundry.toml ./ # bring in the template's config explicitly
forge build                 # verify src/interfaces/*.sol compile

# 3. generate + commit ABIs (out/) so frontend/keeper can wire against them
```

Base Sepolia v4 addresses (verified, see docs/CONTRACTS.md): PoolManager `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408`. KYCHook needs CREATE2 address-mining (`HookMiner` ships in the template) — do it first; it blocks all swap testing.
