// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console} from "forge-std/console.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";

import {BaseScript} from "./base/BaseScript.sol";

import {MockStock} from "../src/MockStock.sol";
import {KYCHook} from "../src/KYCHook.sol";
import {UniswapExecutor} from "../src/UniswapExecutor.sol";

/// @notice Deploys the full workstream-B stack: KYCHook (mined CREATE2 address), mock USDC, 8 mock
///         stocks, the UniswapExecutor, and one ~100k-deep stock/USDC pool per ticker — all wired up.
/// @dev Runs locally with `forge script` (chainId 31337 spins up fresh v4 artifacts), or broadcasts
///      to Base Sepolia with `--rpc-url base_sepolia --broadcast` (uses canonical v4 addresses).
///      Copy the logged addresses into shared/src/addresses.ts.
contract DeployExecutionScript is BaseScript {
    uint24 constant LP_FEE = 3000;
    int24 constant TICK_SPACING = 60;
    uint256 constant SEED_USDC = 100_000e6; // ~100k USDC depth per pool (ISSUES #6)

    string[8] TICKERS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "JPM"];
    // demo oracle prices, E8 (8-dp USD)
    uint256[8] PRICES_E8 = [
        uint256(180e8),
        420e8,
        120e8,
        175e8,
        185e8,
        500e8,
        250e8,
        200e8
    ];

    function run() external {
        vm.startBroadcast();

        // 1. KYCHook at a mined address encoding exactly BEFORE_SWAP_FLAG.
        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG);
        bytes memory ctorArgs = abi.encode(poolManager, deployerAddress);
        (address hookAddr, bytes32 salt) =
            HookMiner.find(CREATE2_FACTORY, flags, type(KYCHook).creationCode, ctorArgs);
        KYCHook hook = new KYCHook{salt: salt}(poolManager, deployerAddress);
        require(address(hook) == hookAddr, "hook address mismatch");

        // 2. Mock USDC (6 dp) + executor.
        MockStock usdc = new MockStock("Mock USD Coin", "USDC", 6);
        UniswapExecutor exec = new UniswapExecutor(poolManager, address(usdc), deployerAddress);
        hook.setAllowed(address(exec), true);
        // Workstream A re-points the vault at the real FundVault via setVault() at integration;
        // until then the deployer acts as the stub vault so B's stack is demoable standalone.
        exec.setVault(deployerAddress);
        exec.setKeeper(deployerAddress);

        console.log("KYCHook        ", address(hook));
        console.log("MockUSDC       ", address(usdc));
        console.log("UniswapExecutor", address(exec));

        // 3. One mock stock + seeded pool per ticker.
        usdc.mint(deployerAddress, uint256(SEED_USDC) * 8 * 2);
        usdc.approve(address(permit2), type(uint256).max);
        permit2.approve(address(usdc), address(positionManager), type(uint160).max, type(uint48).max);

        for (uint256 i = 0; i < 8; i++) {
            _deployAndSeed(hook, usdc, exec, TICKERS[i], PRICES_E8[i]);
        }

        vm.stopBroadcast();
    }

    function _deployAndSeed(
        KYCHook hook,
        MockStock usdc,
        UniswapExecutor exec,
        string memory ticker,
        uint256 priceE8
    ) internal {
        MockStock token = new MockStock(string.concat("Mock ", ticker), string.concat("m", ticker), 18);
        bytes32 asset = bytes32(bytes(ticker));

        (Currency c0, Currency c1) = address(token) < address(usdc)
            ? (Currency.wrap(address(token)), Currency.wrap(address(usdc)))
            : (Currency.wrap(address(usdc)), Currency.wrap(address(token)));
        PoolKey memory key = PoolKey(c0, c1, LP_FEE, TICK_SPACING, IHooks(hook));

        exec.registerPool(asset, address(token), key);
        uint160 startSqrt = exec.targetSqrtPriceX96(asset, priceE8);
        poolManager.initialize(key, startSqrt);

        token.approve(address(permit2), type(uint256).max);
        permit2.approve(address(token), address(positionManager), type(uint160).max, type(uint48).max);

        _seed(key, address(token) < address(usdc), startSqrt, priceE8, address(token));

        console.log(ticker);
        console.log("   token", address(token));
    }

    /// @dev Seeds ~SEED_USDC of liquidity at the oracle price into an initialized pool.
    function _seed(PoolKey memory key, bool tokenIsZero, uint160 startSqrt, uint256 priceE8, address token) internal {
        uint256 tokenAmt = (SEED_USDC * 1e20) / priceE8; // USDC(6dp) -> token(18dp) at priceE8
        MockStock(token).mint(deployerAddress, tokenAmt * 2);

        int24 cur = TickMath.getTickAtSqrtPrice(startSqrt);
        int24 lower = ((cur - 1000 * TICK_SPACING) / TICK_SPACING) * TICK_SPACING;
        int24 upper = ((cur + 1000 * TICK_SPACING) / TICK_SPACING) * TICK_SPACING;
        (uint256 a0, uint256 a1) = tokenIsZero ? (tokenAmt, SEED_USDC) : (SEED_USDC, tokenAmt);
        uint128 liq = LiquidityAmounts.getLiquidityForAmounts(
            startSqrt, TickMath.getSqrtPriceAtTick(lower), TickMath.getSqrtPriceAtTick(upper), a0, a1
        );

        // MINT_POSITION + SETTLE_PAIR (pay), then SWEEP both to refund excess to the deployer.
        bytes memory actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR), uint8(Actions.SWEEP), uint8(Actions.SWEEP)
        );
        bytes[] memory params = new bytes[](4);
        params[0] = abi.encode(key, lower, upper, liq, type(uint256).max, type(uint256).max, deployerAddress, "");
        params[1] = abi.encode(key.currency0, key.currency1);
        params[2] = abi.encode(key.currency0, deployerAddress);
        params[3] = abi.encode(key.currency1, deployerAddress);
        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp + 3600);
    }
}
