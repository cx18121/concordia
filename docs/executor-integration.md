# Wiring the Vault to the UniswapExecutor (A ↔ B)

How `FundVault.executeBasket` / `closePositions` drive the execution layer. Workstream B owns
`UniswapExecutor`; this is the contract A calls. Interface: `contracts/src/interfaces/IUniswapExecutor.sol`.

## One-time wiring (at deploy)

The executor trusts exactly one `vault` and one `keeper`, set by its `owner`:

```solidity
executor.setVault(address(fundVault));   // only this address may call the swap fns
executor.setKeeper(creKeeperAddress);    // only this address may call repeg()
```

The deploy script (`script/04_DeployExecution.s.sol`) already deploys the executor, allowlists it in
the KYCHook, and registers all 8 pools. It temporarily points `vault` at the deployer so B is demoable
standalone — **A re-points it with `setVault(fundVault)` at integration.**

## Who holds what

The **Vault** holds both the USDC and the stock tokens — NAV reads `IERC20(tokenOf[a]).balanceOf(vault)`.
The executor is stateless w.r.t. balances: it pulls input from the caller (the Vault) and sends output
back to the caller. So every call is **approve-then-swap**.

## executeBasket(assets, weightsBps)

For each asset, spend its slice of deployable USDC:

```solidity
uint256 deployable = USDC.balanceOf(address(this)) - rewardPool;   // your own accounting
for (uint256 i; i < assets.length; i++) {
    uint256 usdcAmount = deployable * weightsBps[i] / 1e4;
    USDC.approve(address(executor), usdcAmount);                    // executor does transferFrom
    uint256 tokenOut = executor.swapUsdcForToken(assets[i], usdcAmount);
    // tokenOut of tokenOf(assets[i]) now sits in this Vault; record it in heldAssets
}
```

`swapUsdcForToken` pulls `usdcAmount` USDC from you and returns the stock tokens to you.

## closePositions()

Sell every held position back to USDC:

```solidity
for (uint256 i; i < heldAssets.length; i++) {
    bytes32 a = heldAssets[i];
    address token = executor.tokenOf(a);
    uint256 bal = IERC20(token).balanceOf(address(this));
    if (bal == 0) continue;
    IERC20(token).approve(address(executor), bal);
    executor.swapTokenForUsdc(a, bal);          // USDC returns to this Vault
}
// clear heldAssets
```

## Notes / gotchas

- **Symbols are `bytes32`** left-aligned (`bytes32("AAPL")`), matching `shared/tickerToBytes32`. Pass the
  same symbols the executor was registered with (`executor.tokenOf(a)` returns 0 for unregistered).
- **Swaps execute at POOL price, NAV values at ORACLE price.** The keeper calls `executor.repeg(asset,
  oraclePriceE8)` each cycle to keep them aligned, so `executeBasket` at lock isn't a source of phantom
  P&L. The CONTRACTS.md §7 fallback (tolerate the gap, value at oracle) still holds if a repeg is skipped.
- **Slippage:** the executor currently swaps with no min-out (full exact-in). Fine for the demo's deep
  ~100k pools; if you want a guard at integration, say so and B adds a `minOut` param.
- **Return values** (`tokenOut` / `usdcOut`) are the exact amounts moved — use them to update positions
  rather than re-reading balances if you prefer.
