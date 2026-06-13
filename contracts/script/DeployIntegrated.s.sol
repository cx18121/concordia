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
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";

import {BaseScript} from "./base/BaseScript.sol";

import {MockStock} from "../src/MockStock.sol";
import {KYCHook} from "../src/KYCHook.sol";
import {UniswapExecutor} from "../src/UniswapExecutor.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {FundVault} from "../src/FundVault.sol";
import {Governance} from "../src/Governance.sol";

/// @notice The A↔B integrated deploy: workstream B's execution stack (KYCHook + mock USDC + mock
///         stocks + UniswapExecutor + seeded v4 pools) AND workstream A's core (PriceOracle +
///         FundVault + Governance) in ONE deployment, fully wired so the Vault trades the winning
///         basket through the REAL executor. This is what `04_DeployExecution` + `DeployCore` could
///         not do separately — each minted its own USDC and its own stocks, so a Vault built on one
///         could never trade the other's pools. Here both share a single USDC and the Vault registers
///         the executor's exact pool tokens, which is the whole point of the integration.
/// @dev The wiring sequence is the one proven end-to-end in test/Integration.t.sol. Runs locally with
///      `forge script` (chainId 31337 spins up fresh v4 artifacts) or broadcasts to Base Sepolia.
///      Copy the logged addresses into shared/src/addresses.ts.
///
///      Env:
///        KEEPER    (optional) CRE keeper address; defaults to the deployer
///        MINT_USDC (optional) demo USDC (whole units) to mint to the deployer after setup
///
///      Run (Base Sepolia):
///        forge script script/DeployIntegrated.s.sol --tc DeployIntegratedScript \
///          --rpc-url base_sepolia --private-key $PK --broadcast --verify
contract DeployIntegratedScript is BaseScript {
    uint24 constant LP_FEE = 3000;
    int24 constant TICK_SPACING = 60;
    uint256 constant SEED_USDC = 100_000e6; // ~100k USDC depth per pool (ISSUES #6)
    uint256 constant REPEG_RESERVE_USDC = 20_000e6; // executor's per-pool repeg reserve (both sides)
    // Liquidity band: wide enough to hold a cycle's price move (±10% ≈ 950 ticks) but tight enough
    // that a lock-time basket buy barely moves price — keeps NAV (valued at the oracle) continuous
    // through lock instead of taking a slippage haircut. ±100 spacings (±6000 ticks ≈ ±82%).
    int24 constant RANGE_SPACINGS = 100;
    uint256 constant N = 18; // must match shared/src/fund.ts UNIVERSE

    // The full votable universe (== shared UNIVERSE). Prices are demo ballparks, E8; the keeper
    // overwrites them with live/replay data on its first tick.
    string[N] TICKERS = [
        "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "JPM", "XOM",
        "UNH", "WMT", "SPY", "QQQ", "XLK", "XLF", "XLE", "XLV", "ARKK"
    ];
    uint256[N] PRICES_E8 = [
        uint256(180e8), 420e8, 120e8, 175e8, 185e8, 500e8, 250e8, 200e8, 105e8,
        490e8, 60e8, 510e8, 440e8, 210e8, 40e8, 90e8, 145e8, 50e8
    ];

    function run() external {
        address keeper = vm.envOr("KEEPER", deployerAddress);
        uint256 mintUsdc = vm.envOr("MINT_USDC", uint256(0));
        // CRE report path (ISSUES #C2). 0 = leave it disabled and drive cycles with the keeper EOA
        // (the Bun heartbeat); set it to the KeystoneForwarder to enable the CRE workflow's writes.
        address forwarder = vm.envOr("FORWARDER", address(0));

        vm.startBroadcast();

        // ===== B: KYCHook (mined CREATE2 address) + mock USDC + executor =====
        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG);
        bytes memory ctorArgs = abi.encode(poolManager, deployerAddress);
        (address hookAddr, bytes32 salt) =
            HookMiner.find(CREATE2_FACTORY, flags, type(KYCHook).creationCode, ctorArgs);
        KYCHook hook = new KYCHook{salt: salt}(poolManager, deployerAddress);
        require(address(hook) == hookAddr, "hook address mismatch");

        MockStock usdc = new MockStock("Mock USD Coin", "USDC", 6);
        UniswapExecutor exec = new UniswapExecutor(poolManager, address(usdc), deployerAddress);
        hook.setAllowed(address(exec), true);
        exec.setKeeper(keeper);

        // ===== A: core, on the SHARED USDC =====
        PriceOracle oracle = new PriceOracle(keeper);
        FundVault vault = new FundVault(usdc, oracle, deployerAddress);
        Governance gov = new Governance(vault, oracle, keeper);
        vault.setGovernance(address(gov));

        // ===== the A↔B wire: the Vault trades through the REAL executor =====
        vault.setExecutor(exec);
        exec.setVault(address(vault)); // re-point from the deploy-time stub to the real Vault

        // ===== optional CRE report path (ISSUES #C2) =====
        if (forwarder != address(0)) {
            exec.setForwarder(forwarder); // owner == deployer, always allowed
            // oracle/gov.setForwarder is onlyKeeper — only settable here when the deployer IS the
            // keeper; otherwise the keeper must call them post-deploy (one tx each).
            if (keeper == deployerAddress) {
                oracle.setForwarder(forwarder);
                gov.setForwarder(forwarder);
            } else {
                console.log("NOTE: keeper must call oracle.setForwarder + gov.setForwarder =", forwarder);
            }
        }

        // ===== liquidity prep =====
        usdc.mint(deployerAddress, SEED_USDC * N * 2);
        usdc.approve(address(permit2), type(uint256).max);
        permit2.approve(address(usdc), address(positionManager), type(uint160).max, type(uint48).max);
        usdc.mint(address(exec), REPEG_RESERVE_USDC * N); // USDC side of every pool's repeg reserve

        // ===== one mock stock + seeded pool per ticker, registered on BOTH exec and vault =====
        for (uint256 i = 0; i < N; i++) {
            _standUpPool(hook, usdc, exec, vault, TICKERS[i], PRICES_E8[i]);
        }

        if (mintUsdc > 0) usdc.mint(deployerAddress, mintUsdc * 1e6);

        vm.stopBroadcast();

        // ===== addresses for shared/src/addresses.ts =====
        console.log("--- Concordia: integrated deploy ---");
        console.log("USDC           ", address(usdc));
        console.log("PriceOracle    ", address(oracle));
        console.log("FundVault      ", address(vault));
        console.log("Governance     ", address(gov));
        console.log("UniswapExecutor", address(exec));
        console.log("KYCHook        ", address(hook));
        console.log("keeper         ", keeper);
        console.log("admin          ", deployerAddress);
    }

    /// Deploy the stock token, init + seed its USDC pool at the oracle price, register it on the
    /// executor (so it can trade) AND the vault (so it can mark NAV), and fund the repeg reserve.
    function _standUpPool(
        KYCHook hook,
        MockStock usdc,
        UniswapExecutor exec,
        FundVault vault,
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
        vault.registerAsset(asset, address(token)); // shared token: Vault marks NAV on what B trades

        uint160 startSqrt = exec.targetSqrtPriceX96(asset, priceE8);
        poolManager.initialize(key, startSqrt);

        token.approve(address(permit2), type(uint256).max);
        permit2.approve(address(token), address(positionManager), type(uint160).max, type(uint48).max);
        _seed(key, address(token) < address(usdc), startSqrt, priceE8, address(token));

        // stock side of the executor's repeg reserve (~REPEG_RESERVE_USDC worth)
        token.mint(address(exec), (REPEG_RESERVE_USDC * 1e20) / priceE8);

        console.log(ticker, address(token));
    }

    /// @dev Seeds ~SEED_USDC of liquidity at the oracle price into an initialized pool.
    function _seed(PoolKey memory key, bool tokenIsZero, uint160 startSqrt, uint256 priceE8, address token) internal {
        uint256 tokenAmt = (SEED_USDC * 1e20) / priceE8; // USDC(6dp) -> token(18dp) at priceE8
        MockStock(token).mint(deployerAddress, tokenAmt * 2);

        int24 cur = TickMath.getTickAtSqrtPrice(startSqrt);
        int24 lower = ((cur - RANGE_SPACINGS * TICK_SPACING) / TICK_SPACING) * TICK_SPACING;
        int24 upper = ((cur + RANGE_SPACINGS * TICK_SPACING) / TICK_SPACING) * TICK_SPACING;
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
