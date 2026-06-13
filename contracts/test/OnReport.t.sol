// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {PriceOracle} from "../src/PriceOracle.sol";
import {FundVault} from "../src/FundVault.sol";
import {Governance} from "../src/Governance.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {SyntheticExecutor} from "../src/mocks/SyntheticExecutor.sol";
import {IGovernance} from "../src/interfaces/IGovernance.sol";

/// @notice The CRE write path (ISSUES #C2): the keeper does not call the onlyKeeper functions
///         directly — it emits a DON report the KeystoneForwarder delivers to `onReport`. This proves
///         that path drives a full cycle to the SAME on-chain result as the heartbeat's direct calls,
///         that only the trusted forwarder may call it, and that the report encoding the contracts
///         decode matches keeper/src/core/encode.ts (same abi tuple shapes).
/// @dev Uses the SyntheticExecutor so the focus stays on the Oracle/Governance report decoding;
///      the executor's own repeg-via-onReport is covered in UniswapExecutor.t.sol against a real pool.
contract OnReportTest is Test {
    address keeper = makeAddr("keeper");
    address admin = makeAddr("admin");
    address forwarder = makeAddr("forwarder");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    MockERC20 usdc;
    PriceOracle oracle;
    FundVault vault;
    Governance gov;
    SyntheticExecutor exec;

    bytes32 constant AAPL = bytes32("AAPL");
    bytes32 constant NVDA = bytes32("NVDA");
    bytes32 constant MSFT = bytes32("MSFT");
    bytes32 constant GOOGL = bytes32("GOOGL");
    uint256 constant USDC_ONE = 1e6;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        oracle = new PriceOracle(keeper);

        vm.startPrank(admin);
        vault = new FundVault(usdc, oracle, admin);
        gov = new Governance(vault, oracle, keeper);
        vault.setGovernance(address(gov));
        exec = new SyntheticExecutor(address(usdc), oracle);
        vault.setExecutor(exec);
        bytes32[4] memory syms = [AAPL, NVDA, MSFT, GOOGL];
        for (uint256 i = 0; i < syms.length; i++) {
            MockERC20 t = new MockERC20("Mock", "m", 18);
            vault.registerAsset(syms[i], address(t));
            exec.register(syms[i], address(t));
        }
        vm.stopPrank();

        // wire the CRE report path
        vm.startPrank(keeper);
        oracle.setForwarder(forwarder);
        gov.setForwarder(forwarder);
        vm.stopPrank();

        _join(alice, 10_000 * USDC_ONE);
        _join(bob, 6_000 * USDC_ONE);
        _join(carol, 4_000 * USDC_ONE);
    }

    // -------------------------------------------------------------- the cycle, driven via onReport

    /// Same end-to-end cycle as Cycle.t.sol's test_fullCycle, but every keeper action arrives as a
    /// forwarder-delivered report instead of a direct EOA call. The result must be identical.
    function test_creWritePath_fullCycle() public {
        // prices (oracle report) — encodePricesReport: (bytes32[], uint256[], uint256)
        _deliver(address(oracle), _pricesReport(200e8, 100e8, 400e8, 150e8, 5000e8));

        // OPEN (governance lifecycle report, action 0)
        _deliver(address(gov), _lifecycle(0));
        assertEq(uint8(gov.state()), uint8(IGovernance.State.OPEN));
        assertEq(gov.votingPower(alice), 5000, "power snapshot identical to EOA path");

        // votes are ordinary user calls (unchanged by the driver)
        vm.prank(alice);
        gov.castVote(_one(AAPL));
        vm.prank(bob);
        gov.castVote(_one(NVDA));
        IGovernance.Alloc[] memory split = new IGovernance.Alloc[](2);
        split[0] = IGovernance.Alloc(MSFT, 5000);
        split[1] = IGovernance.Alloc(GOOGL, 5000);
        vm.prank(carol);
        gov.castVote(split);

        // LOCK (action 1)
        _deliver(address(gov), _lifecycle(1));
        assertEq(uint8(gov.state()), uint8(IGovernance.State.LOCKED));
        assertApproxEqAbs(vault.navAtLock(), 20_000 * USDC_ONE, 4);

        // price move +10% stocks, +2% S&P (oracle report)
        _deliver(address(oracle), _pricesReport(220e8, 110e8, 440e8, 165e8, 5100e8));
        assertEq(gov.fundExcessE4(), 800, "excess +8% via report path");

        // RESOLVE (action 2, inner = (address[], int256[], uint256[]))
        address[] memory ms = _three();
        int256[] memory acc = new int256[](3);
        acc[0] = 200;
        acc[1] = 200;
        acc[2] = 200;
        uint256[] memory credit = new uint256[](3);
        credit[0] = 5000;
        credit[1] = 3000;
        credit[2] = 2000;
        _deliver(address(gov), _resolveReport(ms, acc, credit));

        assertEq(uint8(gov.state()), uint8(IGovernance.State.IDLE));
        assertEq(gov.cycleId(), 1);
        assertApproxEqAbs(vault.rewardPool(), 400 * USDC_ONE, 100, "rewards funded identically");
        assertEq(gov.accuracyOf(alice), 200);
        assertEq(gov.cyclesParticipated(alice), 1);
    }

    // -------------------------------------------------------------- auth + negative paths

    /// onReport is only callable by the trusted forwarder — a random caller (even the keeper EOA)
    /// can't inject a report; that's what makes the report path safe to leave wired beside the EOA path.
    function test_onReport_onlyForwarder() public {
        bytes memory open = _lifecycle(0);
        vm.expectRevert(Governance.NotForwarder.selector);
        gov.onReport("", open); // called by this contract, not the forwarder

        vm.prank(keeper); // even the keeper EOA is not the forwarder
        vm.expectRevert(Governance.NotForwarder.selector);
        gov.onReport("", open);

        vm.expectRevert(PriceOracle.NotForwarder.selector);
        oracle.onReport("", _pricesReport(1e8, 1e8, 1e8, 1e8, 1e8));
    }

    /// An unrecognized lifecycle action reverts loudly rather than silently no-op'ing.
    function test_onReport_unknownAction() public {
        vm.prank(forwarder);
        vm.expectRevert(Governance.UnknownAction.selector);
        gov.onReport("", _lifecycle(9));
    }

    /// Disabling the forwarder (set to 0) closes the report path entirely (e.g. when running the
    /// heartbeat EOA driver instead).
    function test_setForwarder_zeroDisablesPath() public {
        vm.prank(keeper);
        gov.setForwarder(address(0));
        vm.prank(forwarder);
        vm.expectRevert(Governance.NotForwarder.selector);
        gov.onReport("", _lifecycle(0));
    }

    // -------------------------------------------------------------- report builders (== encode.ts)

    function _pricesReport(uint256 a, uint256 n, uint256 m, uint256 g, uint256 sp)
        internal
        pure
        returns (bytes memory)
    {
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
        return abi.encode(ks, ps, sp); // parseAbiParameters("bytes32[], uint256[], uint256")
    }

    function _lifecycle(uint8 action) internal pure returns (bytes memory) {
        return abi.encode(action, bytes("")); // parseAbiParameters("uint8, bytes")
    }

    function _resolveReport(address[] memory ms, int256[] memory acc, uint256[] memory credit)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory inner = abi.encode(ms, acc, credit); // ("address[], int256[], uint256[]")
        return abi.encode(uint8(2), inner); // ("uint8, bytes") with RESOLVE=2
    }

    // -------------------------------------------------------------- helpers

    function _deliver(address receiver, bytes memory report) internal {
        vm.prank(forwarder);
        (bool ok,) = receiver.call(abi.encodeWithSignature("onReport(bytes,bytes)", bytes(""), report));
        require(ok, "onReport reverted");
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

    function _join(address who, uint256 amount) internal {
        vm.prank(admin);
        vault.verify(who, "");
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
    }
}
