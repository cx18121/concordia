// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {BaseTest} from "./utils/BaseTest.sol";

import {PriceOracle} from "../src/PriceOracle.sol";
import {FundVault} from "../src/FundVault.sol";
import {Governance} from "../src/Governance.sol";
import {MockStock} from "../src/MockStock.sol";
import {KYCHook} from "../src/KYCHook.sol";
import {UniswapExecutor} from "../src/UniswapExecutor.sol";
import {IGovernance} from "../src/interfaces/IGovernance.sol";

/// @notice A↔B integration: the SAME full cycle Cycle.t.sol proves on the SyntheticExecutor, but
///         driven through the REAL workstream-B stack — UniswapExecutor swapping on live v4 pools,
///         gated by the KYCHook. This is milestone M1 ("full cycle on a local fork with real swaps").
///         It also pins the wiring the DeployIntegrated script must reproduce: ONE shared USDC, the
///         Vault registering B's exact pool tokens, executor.setVault(vault), vault.setExecutor(exec).
/// @dev Tolerances are wider than the synthetic test on purpose — real swaps carry the 0.3% LP fee
///      plus slippage, and the keeper re-pegs pools to the oracle each cycle (CRE the arbitrageur),
///      so NAV (valued at the oracle) stays ~continuous through lock/resolve but never exact.
contract IntegrationTest is BaseTest {
    using EasyPosm for IPositionManager;

    // actors
    address keeper = makeAddr("keeper");
    address admin; // = address(this): runs the set-once wiring + owns the hook/executor
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    // core (A)
    PriceOracle oracle;
    FundVault vault;
    Governance gov;
    // execution (B)
    KYCHook hook;
    UniswapExecutor exec;
    MockStock usdc; // 6dp, the ONE shared USDC for both Vault and Executor

    // symbols + the tokens behind them (shared: Vault marks NAV on these, Executor pools trade them)
    bytes32 constant AAPL = bytes32("AAPL");
    bytes32 constant NVDA = bytes32("NVDA");
    bytes32 constant MSFT = bytes32("MSFT");
    bytes32 constant GOOGL = bytes32("GOOGL");
    bytes32[4] syms = [AAPL, NVDA, MSFT, GOOGL];
    uint256[4] pricesE8 = [uint256(200e8), 100e8, 400e8, 150e8];
    mapping(bytes32 => MockStock) tokenOf;
    mapping(bytes32 => PoolKey) keyOf;

    uint256 constant USDC_ONE = 1e6;
    uint256 constant SP_OPEN = 5000e8;

    function setUp() public {
        admin = address(this);
        deployArtifactsAndLabel();

        // ---- ONE shared USDC ----
        usdc = new MockStock("Mock USD Coin", "USDC", 6);

        // ---- B: KYCHook (mined-bits address) + executor ----
        address flags = address(uint160(Hooks.BEFORE_SWAP_FLAG) ^ (0x4444 << 144));
        deployCodeTo("KYCHook.sol:KYCHook", abi.encode(poolManager, admin), flags);
        hook = KYCHook(flags);
        exec = new UniswapExecutor(poolManager, address(usdc), admin);
        exec.setKeeper(keeper);
        hook.setAllowed(address(exec), true);

        // ---- A: core, against the shared USDC ----
        oracle = new PriceOracle(keeper);
        vault = new FundVault(usdc, oracle, admin);
        gov = new Governance(vault, oracle, keeper);
        vault.setGovernance(address(gov));

        // ---- the A↔B wire: Vault trades through the REAL executor ----
        vault.setExecutor(exec);
        exec.setVault(address(vault)); // re-point from the deploy-time stub to the real Vault

        // ---- per ticker: token + seeded pool (B), registered on BOTH sides ----
        for (uint256 i = 0; i < syms.length; i++) {
            _standUpPool(syms[i], pricesE8[i]);
        }

        // oracle prices so NAV can mark (keeper posts these every cycle in production)
        _postPrices(pricesE8[0], pricesE8[1], pricesE8[2], pricesE8[3], SP_OPEN);

        // members join: verify + deposit (deposit registers governance membership)
        _join(alice, 10_000 * USDC_ONE);
        _join(bob, 6_000 * USDC_ONE);
        _join(carol, 4_000 * USDC_ONE);
    }

    // -------------------------------------------------------------- the full cycle (real swaps)

    function test_fullCycle_throughUniswap() public {
        assertEq(vault.totalAssets(), 20_000 * USDC_ONE, "NAV at deposit = 20k cash");
        assertEq(gov.memberCount(), 3);

        // --- OPEN ---
        vm.prank(keeper);
        gov.openCycle();
        assertEq(uint8(gov.state()), uint8(IGovernance.State.OPEN));

        // --- VOTE: alice→AAPL, bob→NVDA, carol→MSFT/GOOGL 50/50 (raw 50/30/10/10) ---
        vm.prank(alice);
        gov.castVote(_one(AAPL));
        vm.prank(bob);
        gov.castVote(_one(NVDA));
        IGovernance.Alloc[] memory split = new IGovernance.Alloc[](2);
        split[0] = IGovernance.Alloc(MSFT, 5000);
        split[1] = IGovernance.Alloc(GOOGL, 5000);
        vm.prank(carol);
        gov.castVote(split);

        // water-fill cap → 30/30/20/20, fully invested under the 30% cap
        (, uint256[] memory bw) = gov.selectBasket();
        for (uint256 i = 0; i < bw.length; i++) {
            assertLe(bw[i], 3000, "no position over the 30% cap");
        }

        // --- LOCK: real USDC→stock swaps on v4 pools, then snapshot NAV/bench ---
        vm.prank(keeper);
        gov.lockCycle();
        assertEq(uint8(gov.state()), uint8(IGovernance.State.LOCKED));
        // every basket position actually bought + held by the Vault
        assertGt(tokenOf[AAPL].balanceOf(address(vault)), 0, "AAPL bought");
        assertGt(tokenOf[GOOGL].balanceOf(address(vault)), 0, "GOOGL bought");
        // NAV ~continuous through lock (fee+slippage only); valued at the oracle price
        assertApproxEqRel(vault.totalAssets(), 20_000 * USDC_ONE, 0.02e18, "NAV ~continuous through lock");
        assertApproxEqRel(vault.navAtLock(), 20_000 * USDC_ONE, 0.02e18, "navAtLock snapshot");
        assertEq(vault.benchAtLock(), SP_OPEN);

        // --- PRICE MOVE: all stocks +10%, S&P +2%; keeper re-pegs pools to the new oracle price ---
        _postPrices(220e8, 110e8, 440e8, 165e8, 5100e8);
        _repegAll(220e8, 110e8, 440e8, 165e8);
        assertApproxEqRel(vault.totalAssets(), 22_000 * USDC_ONE, 0.02e18, "NAV +10% from positions");
        // fund excess = +10% positions vs +2% bench ≈ +8% (800 E4); slippage keeps it just under
        int256 excess = gov.fundExcessE4();
        assertApproxEqAbs(excess, int256(800), 60, "excess ~ +8% over the benchmark");

        // --- RESOLVE: settle (HWM + absolute-gain gated) then real stock→USDC unwind ---
        address[] memory ms = _three();
        int256[] memory newAcc = new int256[](3);
        newAcc[0] = 200;
        newAcc[1] = 200;
        newAcc[2] = 200;
        uint256[] memory credit = new uint256[](3);
        credit[0] = 5000;
        credit[1] = 3000;
        credit[2] = 2000;
        vm.prank(keeper);
        gov.resolveCycle(ms, newAcc, credit);

        assertEq(uint8(gov.state()), uint8(IGovernance.State.IDLE));
        assertEq(gov.cycleId(), 1);

        // positions fully unwound → all cash
        for (uint256 i = 0; i < syms.length; i++) {
            assertEq(tokenOf[syms[i]].balanceOf(address(vault)), 0, "position closed");
        }

        // reward pool funded from real realized USDC (≈25% of the ~8% alpha on 20k ≈ 400 USDC)
        uint256 pool = vault.rewardPool();
        assertApproxEqRel(pool, 400 * USDC_ONE, 0.05e18, "reward pool ~25% of alpha");
        assertEq(gov.accuracyOf(alice), 200, "accuracy recorded");
        assertEq(gov.cyclesParticipated(alice), 1);

        // rewardPool is backed by real USDC: every member can claim their split
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 aliceCredit = vault.rewardCredit(alice);
        assertApproxEqRel(aliceCredit, (pool * 5000) / 1e4, 0.01e18, "alice credited per her split");
        vm.prank(alice);
        uint256 got = vault.claimRewards();
        assertEq(got, aliceCredit);
        assertEq(usdc.balanceOf(alice), aliceBefore + aliceCredit, "claim paid in real USDC");

        // shareholder NAV is up on the cycle (alpha kept, minus the reward cut + swap costs)
        assertGt(vault.totalAssets(), 20_500 * USDC_ONE, "shareholders keep the bulk of the alpha");
    }

    /// The KYC gate is real: revoke the executor and the Vault's lock-time swap reverts.
    function test_kycGate_blocksUnallowlistedExecutor() public {
        hook.setAllowed(address(exec), false);
        vm.prank(keeper);
        gov.openCycle();
        vm.prank(alice);
        gov.castVote(_one(AAPL));
        vm.prank(keeper);
        vm.expectRevert(); // hook reverts beforeSwap → bubbles through executeBasket
        gov.lockCycle();
    }

    // -------------------------------------------------------------- helpers

    /// Deploy a stock token, build + initialize its USDC pool at the oracle price, seed ~100k of
    /// depth, register it on the executor AND the vault, and fund the executor's repeg reserve.
    function _standUpPool(bytes32 sym, uint256 priceE8) internal {
        MockStock token = new MockStock(string.concat("Mock ", _str(sym)), "mTKN", 18);
        tokenOf[sym] = token;

        (Currency c0, Currency c1) = address(token) < address(usdc)
            ? (Currency.wrap(address(token)), Currency.wrap(address(usdc)))
            : (Currency.wrap(address(usdc)), Currency.wrap(address(token)));
        PoolKey memory key = PoolKey(c0, c1, 3000, 60, IHooks(hook));
        keyOf[sym] = key;

        exec.registerPool(sym, address(token), key);
        vault.registerAsset(sym, address(token)); // shared token: Vault marks NAV on what B trades

        uint160 startSqrt = exec.targetSqrtPriceX96(sym, priceE8);
        poolManager.initialize(key, startSqrt);
        _seed(key, address(token) < address(usdc), startSqrt, priceE8, token);

        // repeg reserve, both sides (so the keeper can nudge price either way)
        usdc.mint(address(exec), 50_000e6);
        token.mint(address(exec), (50_000e6 * 1e20) / priceE8);
    }

    function _seed(PoolKey memory key, bool tokenIsZero, uint160 startSqrt, uint256 priceE8, MockStock token)
        internal
    {
        uint256 usdcAmt = 100_000e6;
        uint256 tokenAmt = (100_000e6 * 1e20) / priceE8; // 100k USDC worth of token at priceE8
        usdc.mint(address(this), usdcAmt * 2);
        token.mint(address(this), tokenAmt * 2);
        usdc.approve(address(permit2), type(uint256).max);
        token.approve(address(permit2), type(uint256).max);
        permit2.approve(address(usdc), address(positionManager), type(uint160).max, type(uint48).max);
        permit2.approve(address(token), address(positionManager), type(uint160).max, type(uint48).max);

        // Concentrate the 100k in a band wide enough to hold the cycle's price move (±10% ≈ 950
        // ticks) but tight enough that the lock-time buy barely moves price — the "deep pool, small
        // impact" the design assumes (ISSUES #6). ±100 spacings (±6000 ticks ≈ ±82%) does both.
        int24 cur = TickMath.getTickAtSqrtPrice(startSqrt);
        int24 lower = ((cur - 100 * 60) / 60) * 60;
        int24 upper = ((cur + 100 * 60) / 60) * 60;
        (uint256 a0, uint256 a1) = tokenIsZero ? (tokenAmt, usdcAmt) : (usdcAmt, tokenAmt);
        uint128 liq = LiquidityAmounts.getLiquidityForAmounts(
            startSqrt, TickMath.getSqrtPriceAtTick(lower), TickMath.getSqrtPriceAtTick(upper), a0, a1
        );
        positionManager.mint(
            key, lower, upper, liq, type(uint256).max, type(uint256).max, address(this), block.timestamp, ""
        );
    }

    function _postPrices(uint256 a, uint256 n, uint256 m, uint256 g, uint256 sp) internal {
        bytes32[] memory ks = new bytes32[](4);
        ks[0] = AAPL;
        ks[1] = NVDA;
        ks[2] = MSFT;
        ks[3] = GOOGL;
        uint256[] memory ps = new uint256[](4);
        ps[0] = a;
        ps[1] = n;
        ps[2] = m;
        ps[3] = g;
        vm.prank(keeper);
        oracle.setPrices(ks, ps, sp);
    }

    function _repegAll(uint256 a, uint256 n, uint256 m, uint256 g) internal {
        uint256[4] memory tgt = [a, n, m, g];
        for (uint256 i = 0; i < syms.length; i++) {
            vm.prank(keeper);
            exec.repeg(syms[i], tgt[i]);
        }
    }

    function _join(address who, uint256 amount) internal {
        vault.verify(who, "");
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
    }

    function _one(bytes32 sym) internal pure returns (IGovernance.Alloc[] memory al) {
        al = new IGovernance.Alloc[](1);
        al[0] = IGovernance.Alloc(sym, 10000);
    }

    function _three() internal view returns (address[] memory ms) {
        ms = new address[](3);
        ms[0] = alice;
        ms[1] = bob;
        ms[2] = carol;
    }

    function _str(bytes32 b) internal pure returns (string memory) {
        uint256 len;
        while (len < 32 && b[len] != 0) len++;
        bytes memory out = new bytes(len);
        for (uint256 i = 0; i < len; i++) out[i] = b[i];
        return string(out);
    }
}
