// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {PriceOracle} from "../src/PriceOracle.sol";
import {FundVault} from "../src/FundVault.sol";
import {Governance} from "../src/Governance.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {SyntheticExecutor} from "../src/mocks/SyntheticExecutor.sol";
import {IGovernance} from "../src/interfaces/IGovernance.sol";

/// @notice Workstream A's success criterion: a full scripted cycle on synthetic positions
///         (deposit → open → vote → lock → resolve → claim), plus the guard paths the demo
///         leans on (empty cycle, withdraw between cycles). No Uniswap yet — the Vault trades
///         through a SyntheticExecutor behind IUniswapExecutor.
contract CycleTest is Test {
    // actors
    address keeper = makeAddr("keeper");
    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    // contracts
    MockERC20 usdc;
    PriceOracle oracle;
    FundVault vault;
    Governance gov;
    SyntheticExecutor exec;
    MockERC20 aapl;
    MockERC20 nvda;
    MockERC20 msft;
    MockERC20 googl;

    // symbols
    bytes32 constant AAPL = bytes32("AAPL");
    bytes32 constant NVDA = bytes32("NVDA");
    bytes32 constant MSFT = bytes32("MSFT");
    bytes32 constant GOOGL = bytes32("GOOGL");

    uint256 constant USDC_ONE = 1e6; // 6-dp USDC

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        oracle = new PriceOracle(keeper);

        vm.startPrank(admin);
        vault = new FundVault(usdc, oracle, admin);
        gov = new Governance(vault, oracle, keeper);
        vault.setGovernance(address(gov));
        exec = new SyntheticExecutor(address(usdc), oracle);
        vault.setExecutor(exec);

        aapl = new MockERC20("Mock AAPL", "mAAPL", 18);
        nvda = new MockERC20("Mock NVDA", "mNVDA", 18);
        msft = new MockERC20("Mock MSFT", "mMSFT", 18);
        googl = new MockERC20("Mock GOOGL", "mGOOGL", 18);
        vault.registerAsset(AAPL, address(aapl));
        vault.registerAsset(NVDA, address(nvda));
        vault.registerAsset(MSFT, address(msft));
        vault.registerAsset(GOOGL, address(googl));
        exec.register(AAPL, address(aapl));
        exec.register(NVDA, address(nvda));
        exec.register(MSFT, address(msft));
        exec.register(GOOGL, address(googl));
        vm.stopPrank();

        // verify + fund the three members, then deposit (deposit registers membership)
        _join(alice, 10_000 * USDC_ONE);
        _join(bob, 6_000 * USDC_ONE);
        _join(carol, 4_000 * USDC_ONE);
    }

    function _join(address who, uint256 amount) internal {
        vm.prank(admin);
        vault.verify(who, "");
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
    }

    function _postPrices(uint256 aaplE8, uint256 nvdaE8, uint256 spE8) internal {
        bytes32[] memory a = new bytes32[](2);
        a[0] = AAPL;
        a[1] = NVDA;
        uint256[] memory p = new uint256[](2);
        p[0] = aaplE8;
        p[1] = nvdaE8;
        vm.prank(keeper);
        oracle.setPrices(a, p, spE8);
    }

    function _postPrices4(uint256 aaplE8, uint256 nvdaE8, uint256 msftE8, uint256 googlE8, uint256 spE8) internal {
        bytes32[] memory a = new bytes32[](4);
        a[0] = AAPL;
        a[1] = NVDA;
        a[2] = MSFT;
        a[3] = GOOGL;
        uint256[] memory p = new uint256[](4);
        p[0] = aaplE8;
        p[1] = nvdaE8;
        p[2] = msftE8;
        p[3] = googlE8;
        vm.prank(keeper);
        oracle.setPrices(a, p, spE8);
    }

    function _alloc(bytes32 asset, uint16 w) internal pure returns (IGovernance.Alloc[] memory) {
        IGovernance.Alloc[] memory al = new IGovernance.Alloc[](1);
        al[0] = IGovernance.Alloc(asset, w);
        return al;
    }

    // ---------------------------------------------------------------- the full cycle

    function test_fullCycle() public {
        // initial deposits: 20k total, all in cash
        assertEq(vault.totalAssets(), 20_000 * USDC_ONE, "NAV at deposit");
        assertEq(gov.memberCount(), 3);

        // --- prices at open/lock: AAPL 200, NVDA 100, MSFT 400, GOOGL 150, S&P 5000 ---
        _postPrices4(200e8, 100e8, 400e8, 150e8, 5000e8);

        // --- OPEN: snapshot power (cycle 0: accuracy all 0 → power == capital share) ---
        vm.prank(keeper);
        gov.openCycle();
        assertEq(uint8(gov.state()), uint8(IGovernance.State.OPEN));
        assertEq(gov.votingPower(alice), 5000, "alice 50% of capital");
        assertEq(gov.votingPower(bob), 3000);
        assertEq(gov.votingPower(carol), 2000);

        // --- VOTE: alice→AAPL, bob→NVDA, carol→MSFT/GOOGL 50/50 ---
        vm.prank(alice);
        gov.castVote(_alloc(AAPL, 10000));
        vm.prank(bob);
        gov.castVote(_alloc(NVDA, 10000));
        IGovernance.Alloc[] memory split = new IGovernance.Alloc[](2);
        split[0] = IGovernance.Alloc(MSFT, 5000);
        split[1] = IGovernance.Alloc(GOOGL, 5000);
        vm.prank(carol);
        gov.castVote(split);

        // raw votes: AAPL 50%, NVDA 30%, MSFT 10%, GOOGL 10%. Water-fill cap at 30%:
        // AAPL pins to 30%, its overflow lifts NVDA past 30% so it pins too, MSFT/GOOGL absorb
        // the rest → 30/30/20/20, summing to 100% with NOTHING above the cap.
        (bytes32[] memory bAssets, uint256[] memory bWeights) = gov.selectBasket();
        assertEq(bAssets.length, 4);
        assertEq(bWeights[0], 3000, "AAPL capped at 30%");
        assertEq(bWeights[1], 3000, "NVDA capped at 30%");
        assertEq(bWeights[2], 2000, "MSFT absorbs");
        assertEq(bWeights[3], 2000, "GOOGL absorbs");
        for (uint256 i = 0; i < bWeights.length; i++) {
            assertLe(bWeights[i], 3000, "no position exceeds the 30% cap");
        }

        // --- LOCK: execute the basket, snapshot NAV + benchmark ---
        vm.prank(keeper);
        gov.lockCycle();
        assertEq(uint8(gov.state()), uint8(IGovernance.State.LOCKED));
        assertApproxEqAbs(vault.navAtLock(), 20_000 * USDC_ONE, 4, "NAV unchanged buying at oracle");
        assertEq(vault.benchAtLock(), 5000e8);
        // all four positions held, cash drained into them (fully invested under the cap)
        assertGt(aapl.balanceOf(address(vault)), 0);
        assertGt(googl.balanceOf(address(vault)), 0);
        assertApproxEqAbs(vault.totalAssets(), 20_000 * USDC_ONE, 4, "NAV continuous through lock");

        // --- PRICE MOVE: all stocks +10%, S&P +2% → fund excess ≈ +8% ---
        _postPrices4(220e8, 110e8, 440e8, 165e8, 5100e8);
        assertApproxEqAbs(vault.totalAssets(), 22_000 * USDC_ONE, 10, "NAV +10% from positions");
        assertEq(gov.fundExcessE4(), 800, "excess = +10% - +2% = +8% (800 E4)");

        // --- RESOLVE: keeper supplies off-chain figures; contract does the money ---
        address[] memory ms = new address[](3);
        ms[0] = alice;
        ms[1] = bob;
        ms[2] = carol;
        int256[] memory newAcc = new int256[](3);
        newAcc[0] = 200;
        newAcc[1] = 200;
        newAcc[2] = 200; // EWMA(0, 800) = 200
        uint256[] memory credit = new uint256[](3);
        credit[0] = 5000;
        credit[1] = 3000;
        credit[2] = 2000; // ∝ power on winners

        vm.prank(keeper);
        gov.resolveCycle(ms, newAcc, credit);

        assertEq(uint8(gov.state()), uint8(IGovernance.State.IDLE));
        assertEq(gov.cycleId(), 1);

        // reward pool = 20% of the 8% alpha on 20k locked NAV = 0.20 * 1600 = 320 USDC
        uint256 expectPool = 320 * USDC_ONE;
        assertApproxEqAbs(vault.rewardPool(), expectPool, 100, "reward pool = 20% of alpha");
        assertApproxEqAbs(vault.rewardCredit(alice), (expectPool * 5000) / 1e4, 100);
        assertApproxEqAbs(vault.rewardCredit(bob), (expectPool * 3000) / 1e4, 100);
        assertApproxEqAbs(vault.rewardCredit(carol), (expectPool * 2000) / 1e4, 100);

        // accuracy + participation recorded
        assertEq(gov.accuracyOf(alice), 200);
        assertEq(gov.cyclesParticipated(alice), 1);

        // positions closed → all cash; shareholder NAV up ~8% (alpha minus the reward cut)
        assertEq(aapl.balanceOf(address(vault)), 0);
        assertEq(nvda.balanceOf(address(vault)), 0);
        assertApproxEqAbs(vault.totalAssets(), 21_680 * USDC_ONE, 100, "NAV = 20k + gain minus the 20% reward cut");

        // --- CLAIM ---
        uint256 before = usdc.balanceOf(alice);
        uint256 credited = vault.rewardCredit(alice);
        vm.prank(alice);
        uint256 got = vault.claimRewards();
        assertEq(got, credited);
        assertEq(usdc.balanceOf(alice), before + credited);
        assertEq(vault.rewardCredit(alice), 0);
    }

    // ---------------------------------------------------------------- guard paths

    /// Empty cycle: nobody votes → no basket, fund stays in cash, resolve doesn't revert.
    function test_emptyCycle() public {
        _postPrices(200e8, 100e8, 5000e8);
        vm.prank(keeper);
        gov.openCycle();
        vm.prank(keeper);
        gov.lockCycle();
        assertEq(vault.heldAssets().length, 0, "no positions on empty cycle");

        address[] memory none = new address[](0);
        int256[] memory noAcc = new int256[](0);
        uint256[] memory noCredit = new uint256[](0);
        vm.prank(keeper);
        gov.resolveCycle(none, noAcc, noCredit);
        assertEq(uint8(gov.state()), uint8(IGovernance.State.IDLE));
        assertEq(vault.rewardPool(), 0, "no reward without alpha");
    }

    /// Withdraw is epoch-locked: only processes while IDLE (between cycles).
    function test_withdrawOnlyWhenIdle() public {
        uint256 shares = vault.balanceOf(alice);
        vm.prank(alice);
        vault.requestWithdraw(shares);

        _postPrices(200e8, 100e8, 5000e8);
        vm.prank(keeper);
        gov.openCycle(); // state OPEN

        vm.prank(alice);
        vm.expectRevert(FundVault.NotIdle.selector);
        vault.withdraw();

        // resolve back to IDLE, then withdraw succeeds
        vm.prank(keeper);
        gov.lockCycle();
        address[] memory none = new address[](0);
        vm.prank(keeper);
        gov.resolveCycle(none, new int256[](0), new uint256[](0));

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        uint256 assets = vault.withdraw();
        assertGt(assets, 0);
        assertEq(usdc.balanceOf(alice), before + assets);
        assertEq(vault.balanceOf(alice), 0, "shares burned");
    }

    /// The keeper's resolve enumerates voters + their allocations off-chain via these array views
    /// (ISSUES #C1). Index-based auto-getters can't be read safely (no length → silent truncation
    /// on a mid-loop RPC error), so the whole-array views must return exactly what was cast.
    function test_voteReadbackArrayViews() public {
        _postPrices4(200e8, 100e8, 400e8, 150e8, 5000e8);
        vm.prank(keeper);
        gov.openCycle();

        vm.prank(alice);
        gov.castVote(_alloc(AAPL, 10000));
        IGovernance.Alloc[] memory split = new IGovernance.Alloc[](2);
        split[0] = IGovernance.Alloc(MSFT, 5000);
        split[1] = IGovernance.Alloc(GOOGL, 5000);
        vm.prank(carol);
        gov.castVote(split);

        // getVoters() returns the set, in cast order, with a real length
        address[] memory vs = gov.getVoters();
        assertEq(vs.length, 2, "two voters enumerable");
        assertEq(vs[0], alice);
        assertEq(vs[1], carol);

        // allocOf(addr) returns the whole allocation array per member
        IGovernance.Alloc[] memory aAlloc = gov.allocOf(alice);
        assertEq(aAlloc.length, 1);
        assertEq(aAlloc[0].asset, AAPL);
        assertEq(aAlloc[0].weightBps, 10000);

        IGovernance.Alloc[] memory cAlloc = gov.allocOf(carol);
        assertEq(cAlloc.length, 2);
        assertEq(cAlloc[0].asset, MSFT);
        assertEq(cAlloc[1].asset, GOOGL);
        assertEq(cAlloc[1].weightBps, 5000);

        // a non-voter reads back empty (not a revert) so the keeper can skip cleanly
        assertEq(gov.allocOf(bob).length, 0, "non-voter has no allocations");
    }

    function test_onlyKeeperLifecycle() public {
        vm.expectRevert(Governance.NotKeeper.selector);
        gov.openCycle();
    }

    function test_unverifiedCannotDeposit() public {
        address mallory = makeAddr("mallory");
        usdc.mint(mallory, USDC_ONE);
        vm.startPrank(mallory);
        usdc.approve(address(vault), USDC_ONE);
        vm.expectRevert(FundVault.NotVerified.selector);
        vault.deposit(USDC_ONE);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- review fixes (regressions)

    /// Deposits during OPEN are allowed (they land in the navAtLock baseline) but rejected once
    /// LOCKED — otherwise post-lock capital would be counted as fund performance.
    function test_depositGuard_openVsLocked() public {
        _postPrices(200e8, 100e8, 5000e8);
        vm.prank(keeper);
        gov.openCycle();

        // OPEN: a fresh deposit still works
        usdc.mint(alice, 1_000 * USDC_ONE);
        vm.startPrank(alice);
        usdc.approve(address(vault), 1_000 * USDC_ONE);
        vault.deposit(1_000 * USDC_ONE);
        vm.stopPrank();

        vm.prank(alice);
        gov.castVote(_alloc(AAPL, 10000));
        vm.prank(keeper);
        gov.lockCycle(); // LOCKED

        // LOCKED: deposits rejected
        usdc.mint(alice, 1_000 * USDC_ONE);
        vm.startPrank(alice);
        usdc.approve(address(vault), 1_000 * USDC_ONE);
        vm.expectRevert(FundVault.DepositsLocked.selector);
        vault.deposit(1_000 * USDC_ONE);
        vm.stopPrank();
    }

    /// A vote for an unregistered symbol is rejected at cast time, so it can never reach
    /// lockCycle and brick the cycle in OPEN (executor would revert on the unknown asset).
    function test_voteRejectsUnregisteredAsset() public {
        _postPrices(200e8, 100e8, 5000e8);
        vm.prank(keeper);
        gov.openCycle();
        vm.prank(alice);
        vm.expectRevert(Governance.UnknownAsset.selector);
        gov.castVote(_alloc(bytes32("DOGE"), 10000));
    }

    /// Only the executor's owner can register/remap a symbol → no griefing the traded set.
    function test_syntheticRegisterOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(SyntheticExecutor.NotOwner.selector);
        exec.register(bytes32("DOGE"), address(aapl));
    }

    /// settle rejects a keeper credit split that doesn't sum to 100% on a rewarding cycle,
    /// preventing over-credit that would later underflow rewardPool on claim.
    function test_settleRejectsBadCreditWeights() public {
        _toLockedWithAlpha();

        address[] memory ms = _three();
        int256[] memory newAcc = new int256[](3);
        uint256[] memory bad = new uint256[](3);
        bad[0] = 6000;
        bad[1] = 6000;
        bad[2] = 2000; // sums to 14000, not 1e4

        vm.prank(keeper);
        vm.expectRevert(FundVault.BadCreditWeights.selector);
        gov.resolveCycle(ms, newAcc, bad);
    }

    /// Beating the benchmark while still losing money (market down more than the fund) is a
    /// positive EXCESS but a negative dollar return. No reward pool may be funded — paying then
    /// would carve a bonus out of everyone's shrinking principal. The relative high-water mark
    /// must also stay put, so it can pay on a later cycle that's up in absolute terms.
    function test_downMarketNoReward() public {
        _postPrices4(200e8, 100e8, 400e8, 160e8, 5000e8);
        vm.prank(keeper);
        gov.openCycle();
        vm.prank(alice);
        gov.castVote(_alloc(AAPL, 10000));
        vm.prank(bob);
        gov.castVote(_alloc(NVDA, 10000));
        IGovernance.Alloc[] memory split = new IGovernance.Alloc[](2);
        split[0] = IGovernance.Alloc(MSFT, 5000);
        split[1] = IGovernance.Alloc(GOOGL, 5000);
        vm.prank(carol);
        gov.castVote(split);
        vm.prank(keeper);
        gov.lockCycle();
        assertEq(vault.navAtLock(), 20_000 * USDC_ONE);

        // market −10%, fund −5%: positive relative excess, negative absolute return
        _postPrices4(190e8, 95e8, 380e8, 152e8, 4500e8);
        assertApproxEqAbs(vault.totalAssets(), 19_000 * USDC_ONE, 10, "fund down 5% in dollars");
        assertEq(gov.fundExcessE4(), 500, "still +5% vs the market");

        address[] memory ms = _three();
        int256[] memory newAcc = new int256[](3);
        uint256[] memory credit = new uint256[](3);
        credit[0] = 5000;
        credit[1] = 3000;
        credit[2] = 2000;
        vm.prank(keeper);
        gov.resolveCycle(ms, newAcc, credit);

        assertEq(vault.rewardPool(), 0, "no bonus when the fund lost money");
        assertEq(vault.hwmExcessE4(), 0, "high-water mark not advanced on a down-money cycle");
        assertEq(gov.cyclesParticipated(alice), 1, "cycle still resolved + accuracy recorded");
        assertApproxEqAbs(vault.totalAssets(), 19_000 * USDC_ONE, 10, "shareholders bore the full loss");
    }

    function _three() internal view returns (address[] memory ms) {
        ms = new address[](3);
        ms[0] = alice;
        ms[1] = bob;
        ms[2] = carol;
    }

    /// open → all three vote → lock → both stocks +10%, S&P +2% (fund excess +8%, positive HWM).
    function _toLockedWithAlpha() internal {
        _postPrices(200e8, 100e8, 5000e8);
        vm.prank(keeper);
        gov.openCycle();
        vm.prank(alice);
        gov.castVote(_alloc(AAPL, 10000));
        vm.prank(bob);
        gov.castVote(_alloc(NVDA, 10000));
        IGovernance.Alloc[] memory split = new IGovernance.Alloc[](2);
        split[0] = IGovernance.Alloc(AAPL, 5000);
        split[1] = IGovernance.Alloc(NVDA, 5000);
        vm.prank(carol);
        gov.castVote(split);
        vm.prank(keeper);
        gov.lockCycle();
        _postPrices(220e8, 110e8, 5100e8);
    }
}
