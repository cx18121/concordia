// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {BaseTest} from "./utils/BaseTest.sol";

import {MockStock} from "../src/MockStock.sol";
import {KYCHook} from "../src/KYCHook.sol";
import {UniswapExecutor} from "../src/UniswapExecutor.sol";

/// @notice Standalone tests for workstream B against a STUB vault (this contract plays the Vault).
///         Verifies: pool seeded at the oracle price, USDC<->token swaps execute at ~oracle price,
///         the KYCHook actually blocks an un-allowlisted swapper, and repeg nudges price to target.
contract UniswapExecutorTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    bytes32 constant AAPL = bytes32("AAPL");
    uint256 constant AAPL_PRICE_E8 = 180e8; // $180.00

    MockStock usdc; // 6 dp, like real USDC
    MockStock aapl; // 18 dp, mock tokenized stock

    KYCHook hook;
    UniswapExecutor exec;
    PoolKey poolKey;
    PoolId poolId;

    function setUp() public {
        deployArtifactsAndLabel();

        usdc = new MockStock("Mock USD Coin", "USDC", 6);
        aapl = new MockStock("Mock Apple", "mAAPL", 18);

        // Deploy KYCHook to an address whose low bits encode exactly BEFORE_SWAP_FLAG.
        address flags = address(uint160(Hooks.BEFORE_SWAP_FLAG) ^ (0x4444 << 144));
        bytes memory ctorArgs = abi.encode(poolManager, address(this));
        deployCodeTo("KYCHook.sol:KYCHook", ctorArgs, flags);
        hook = KYCHook(flags);

        // Build the stock/USDC pool key (currencies ordered by address).
        (Currency c0, Currency c1) = address(aapl) < address(usdc)
            ? (Currency.wrap(address(aapl)), Currency.wrap(address(usdc)))
            : (Currency.wrap(address(usdc)), Currency.wrap(address(aapl)));
        poolKey = PoolKey({currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: IHooks(hook)});
        poolId = poolKey.toId();

        // Executor: this contract is owner + stub vault + keeper.
        exec = new UniswapExecutor(poolManager, address(usdc), address(this));
        exec.setVault(address(this));
        exec.setKeeper(address(this));
        exec.registerPool(AAPL, address(aapl), poolKey);
        hook.setAllowed(address(exec), true);

        // Initialize the pool at the oracle price and seed ~100k USDC of liquidity.
        uint160 startSqrt = exec.targetSqrtPriceX96(AAPL, AAPL_PRICE_E8);
        poolManager.initialize(poolKey, startSqrt);
        _seedLiquidity(startSqrt);
    }

    function _seedLiquidity(uint160 startSqrt) internal {
        // Mint generously; posm pulls what the range needs.
        usdc.mint(address(this), 100_000_000e6);
        aapl.mint(address(this), 1_000_000e18);

        usdc.approve(address(permit2), type(uint256).max);
        aapl.approve(address(permit2), type(uint256).max);
        permit2.approve(address(usdc), address(positionManager), type(uint160).max, type(uint48).max);
        permit2.approve(address(aapl), address(positionManager), type(uint160).max, type(uint48).max);

        int24 spacing = poolKey.tickSpacing;
        int24 curTick = TickMath.getTickAtSqrtPrice(startSqrt);
        int24 tickLower = ((curTick - 1000 * spacing) / spacing) * spacing;
        int24 tickUpper = ((curTick + 1000 * spacing) / spacing) * spacing;

        // ~100k USDC + the AAPL-equivalent, sized for the range.
        uint256 usdcAmt = 100_000e6;
        uint256 aaplAmt = uint256(100_000e18) / 180; // ~555 AAPL
        (uint256 amt0, uint256 amt1) = address(aapl) < address(usdc) ? (aaplAmt, usdcAmt) : (usdcAmt, aaplAmt);

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            startSqrt,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            amt0,
            amt1
        );

        positionManager.mint(
            poolKey, tickLower, tickUpper, liquidity, type(uint256).max, type(uint256).max, address(this), block.timestamp, ""
        );
    }

    // ----- tests -----

    function test_seed_priceMatchesOracle() public view {
        (uint160 sqrtNow,,,) = poolManager.getSlot0(poolId);
        // pool initialized exactly at the oracle target
        assertEq(sqrtNow, exec.targetSqrtPriceX96(AAPL, AAPL_PRICE_E8));
    }

    function test_swapUsdcForToken_executesNearOraclePrice() public {
        uint256 usdcIn = 1_000e6; // $1,000
        usdc.mint(address(this), usdcIn);
        usdc.approve(address(exec), usdcIn);

        uint256 aaplBefore = aapl.balanceOf(address(this));
        uint256 tokenOut = exec.swapUsdcForToken(AAPL, usdcIn);
        uint256 received = aapl.balanceOf(address(this)) - aaplBefore;

        assertEq(received, tokenOut, "vault should receive exactly tokenOut");
        assertGt(tokenOut, 0);

        // effective price ($ per AAPL) within ~1.5% of $180 (covers 0.3% fee + small slippage)
        // price = usdcIn(6dp) / tokenOut(18dp) in USD = usdcIn * 1e12 * 1e8 / tokenOut  (E8 USD)
        uint256 effPriceE8 = (usdcIn * 1e12 * 1e8) / tokenOut;
        assertApproxEqRel(effPriceE8, AAPL_PRICE_E8, 0.015e18, "swap price off oracle by >1.5%");
    }

    function test_swapTokenForUsdc_executesNearOraclePrice() public {
        uint256 tokenIn = 5e18; // 5 AAPL ~ $900
        aapl.mint(address(this), tokenIn);
        aapl.approve(address(exec), tokenIn);

        uint256 usdcBefore = usdc.balanceOf(address(this));
        uint256 usdcOut = exec.swapTokenForUsdc(AAPL, tokenIn);
        uint256 received = usdc.balanceOf(address(this)) - usdcBefore;

        assertEq(received, usdcOut, "vault should receive exactly usdcOut");
        assertGt(usdcOut, 0);

        // price = usdcOut(6dp) / tokenIn(18dp) in E8 USD
        uint256 effPriceE8 = (usdcOut * 1e12 * 1e8) / tokenIn;
        assertApproxEqRel(effPriceE8, AAPL_PRICE_E8, 0.015e18, "swap price off oracle by >1.5%");
    }

    function test_hook_blocksUnallowlistedSwapper() public {
        hook.setAllowed(address(exec), false); // revoke

        uint256 usdcIn = 1_000e6;
        usdc.mint(address(this), usdcIn);
        usdc.approve(address(exec), usdcIn);

        vm.expectRevert(); // hook reverts beforeSwap -> bubbles through unlock
        exec.swapUsdcForToken(AAPL, usdcIn);
    }

    function test_onlyVault_canSwap() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(UniswapExecutor.NotVault.selector);
        exec.swapUsdcForToken(AAPL, 1e6);
    }

    function test_partialFill_refundsUnspentInput() public {
        // A trade far larger than the pool can absorb hits the sqrt-price limit and partial-fills:
        // the swap consumes only part of the input. The unspent remainder must come back to the
        // vault, not strand in the executor.
        uint256 huge = 100_000_000e6; // 100M USDC vs a ~100k pool
        usdc.mint(address(this), huge);
        usdc.approve(address(exec), huge);

        uint256 execBefore = usdc.balanceOf(address(exec));
        uint256 myBefore = usdc.balanceOf(address(this));
        uint256 tokenOut = exec.swapUsdcForToken(AAPL, huge);
        uint256 spent = myBefore - usdc.balanceOf(address(this));

        assertGt(tokenOut, 0, "should still receive some token");
        assertLt(spent, huge, "partial fill: not all input consumed");
        assertEq(usdc.balanceOf(address(exec)), execBefore, "no USDC stranded in executor");
    }

    function test_repeg_movesPoolTowardOracle() public {
        // Push the pool off-peg with a large buy, then repeg to the (unchanged) oracle price.
        uint256 bigBuy = 20_000e6;
        usdc.mint(address(this), bigBuy);
        usdc.approve(address(exec), bigBuy);
        exec.swapUsdcForToken(AAPL, bigBuy);

        (uint160 sqrtOff,,,) = poolManager.getSlot0(poolId);
        uint160 targetSqrt = exec.targetSqrtPriceX96(AAPL, AAPL_PRICE_E8);
        assertTrue(sqrtOff != targetSqrt, "buy should have moved price");

        // Fund the executor's repeg reserve with both currencies.
        usdc.mint(address(exec), 1_000_000e6);
        aapl.mint(address(exec), 100_000e18);

        exec.repeg(AAPL, AAPL_PRICE_E8);

        (uint160 sqrtAfter,,,) = poolManager.getSlot0(poolId);
        // closer to target than before
        uint256 distBefore = _absDiff(sqrtOff, targetSqrt);
        uint256 distAfter = _absDiff(sqrtAfter, targetSqrt);
        assertLt(distAfter, distBefore, "repeg should reduce distance to target");
        // and essentially on-peg (within 0.1%)
        assertApproxEqRel(uint256(sqrtAfter), uint256(targetSqrt), 0.001e18, "repeg missed target");
    }

    function _absDiff(uint160 a, uint160 b) internal pure returns (uint256) {
        return a > b ? uint256(a - b) : uint256(b - a);
    }
}
