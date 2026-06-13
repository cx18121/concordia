// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IGovernance} from "./interfaces/IGovernance.sol";
import {IFundVault} from "./interfaces/IFundVault.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @dev Extra Vault getters used here that IFundVault doesn't declare: the lock snapshot,
///      and the asset registry (to reject votes for unregistered symbols).
interface IVaultSnapshot {
    function navAtLock() external view returns (uint256);
    function benchAtLock() external view returns (uint256);
    function tokenOf(bytes32 asset) external view returns (address);
}

/// @title Governance — votes, voting-power snapshot, accuracy store, selection, cycle lifecycle
/// @notice The rules contract. Members cast weighted allocations during OPEN; at LOCK the votes
///         become a proportional basket (cap + dust + renormalize) the Vault executes; at RESOLVE
///         the keeper supplies off-chain per-member figures and this contract computes fund-level
///         excess on-chain and drives Vault.settle(). See docs/CONTRACTS.md §4.
/// @dev Scales: accuracy signed E4, power/weights bps. Lifecycle fns are keeper-triggered (CRE).
///      The selection count EMERGES from votes — no fixed top-N. Money math lives in the Vault.
contract Governance is IGovernance {
    uint256 private constant BPS = 1e4;

    // ---- immutable wiring ----
    IFundVault public immutable vault;
    IPriceOracle public immutable oracle;
    address public immutable keeper; // CRE

    // ---- lifecycle ----
    State public state;
    uint256 public cycleId;

    // ---- membership ----
    address[] public members;
    mapping(address => bool) public isMember;

    // ---- reputation (written by the keeper at resolve) ----
    mapping(address => int256) public accuracyE4;
    mapping(address => uint256) public cyclesParticipated;

    // ---- power snapshot (set at openCycle) ----
    mapping(address => uint256) public powerSnapE4;
    uint256 public totalPowerE4;

    // ---- votes (current cycle) ----
    address[] public voters;
    mapping(address => Alloc[]) public allocOf;
    mapping(bytes32 => uint256) public assetWeightE4;
    bytes32[] public votedAssets;
    mapping(bytes32 => bool) private _assetSeen;

    // ---- tunable constants (mirror @chf/shared; governance-tunable on-site) ----
    uint16 public CAPITAL_BPS = 5000; // 50% capital weight
    uint16 public ACCURACY_BPS = 5000; // 50% accuracy weight
    uint16 public EWMA_ALPHA_BPS = 2500; // 0.25 (used off-chain by CRE; mirrored for UI)
    uint16 public CONFIDENCE_CYCLES = 12; // accuracy phase-in length
    uint16 public POSITION_CAP_BPS = 3000; // 30% max per position
    uint16 public REWARD_POOL_PCT = 2500; // 25% of alpha → reward pool (read by Vault.settle)
    uint256 public DUST_FLOOR_USDC = 0; // min position size; 0 = off for demo

    error NotKeeper();
    error NotVault();
    error WrongState();
    error NotEligible();
    error BadWeights();
    error AlreadyVoted();
    error UnknownAsset();
    error LengthMismatch();

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    modifier inState(State s) {
        if (state != s) revert WrongState();
        _;
    }

    constructor(IFundVault vault_, IPriceOracle oracle_, address keeper_) {
        vault = vault_;
        oracle = oracle_;
        keeper = keeper_;
        state = State.IDLE;
    }

    // -------------------------------------------------------------- membership

    /// @notice Called by the Vault when a verified user makes their first deposit. Idempotent.
    function registerMember(address member) external {
        if (msg.sender != address(vault)) revert NotVault();
        if (!isMember[member]) {
            isMember[member] = true;
            members.push(member);
        }
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }

    // -------------------------------------------------------------- lifecycle (keeper)

    /// @inheritdoc IGovernance
    /// @dev Snapshots VP(i) = (CAPITAL·capShare + ACCURACY·accShare·confidence) and resets votes.
    function openCycle() external onlyKeeper inState(State.IDLE) {
        _resetVotes();

        uint256 totalShares = IERC20(address(vault)).totalSupply();
        // pass 1: Σ max(accuracy, 0) across members (the accuracy-share denominator)
        uint256 sumAcc;
        for (uint256 i = 0; i < members.length; i++) {
            int256 a = accuracyE4[members[i]];
            if (a > 0) sumAcc += uint256(a);
        }
        // pass 2: per-member power = capital half + confidence-ramped accuracy half
        uint256 total;
        for (uint256 i = 0; i < members.length; i++) {
            address m = members[i];
            uint256 capShareE4 =
                totalShares > 0 ? (IERC20(address(vault)).balanceOf(m) * BPS) / totalShares : 0;
            int256 a = accuracyE4[m];
            uint256 accShareE4 = (sumAcc > 0 && a > 0) ? (uint256(a) * BPS) / sumAcc : 0;
            uint256 confE4 = _confidenceE4(m);
            uint256 accContribE4 = (accShareE4 * confE4) / BPS;
            uint256 power = (uint256(CAPITAL_BPS) * capShareE4 + uint256(ACCURACY_BPS) * accContribE4) / BPS;
            powerSnapE4[m] = power;
            total += power;
        }
        totalPowerE4 = total;
        state = State.OPEN;
        emit CycleOpened(cycleId);
    }

    /// @inheritdoc IGovernance
    function lockCycle() external onlyKeeper inState(State.OPEN) {
        (bytes32[] memory assets, uint256[] memory weights) = selectBasket();
        vault.executeBasket(assets, weights);
        vault.recordLock(vault.totalAssets(), oracle.benchmark());
        state = State.LOCKED;
        emit CycleLocked(cycleId);
    }

    /// @inheritdoc IGovernance
    /// @dev Excess is computed on-chain from the Vault's own NAV + the oracle; the keeper only
    ///      supplies the per-member EWMA accuracy and the positive-alpha credit split.
    function resolveCycle(
        address[] calldata members_,
        int256[] calldata newAccuracyE4,
        uint256[] calldata creditWeightBps
    ) external onlyKeeper inState(State.LOCKED) {
        if (members_.length != newAccuracyE4.length || members_.length != creditWeightBps.length) {
            revert LengthMismatch();
        }
        int256 excess = fundExcessE4(); // NAV still marked with open positions

        vault.settle(excess, members_, creditWeightBps); // reserve reward pool (HWM-gated)
        vault.closePositions(); // realize positions → USDC (backs the reserved rewards)

        for (uint256 i = 0; i < members_.length; i++) {
            accuracyE4[members_[i]] = newAccuracyE4[i];
            cyclesParticipated[members_[i]]++;
        }
        cycleId++;
        state = State.IDLE;
        emit CycleResolved(cycleId - 1);
    }

    // -------------------------------------------------------------- users

    /// @inheritdoc IGovernance
    function castVote(Alloc[] calldata allocations) external inState(State.OPEN) {
        if (!vault.verified(msg.sender) || !isMember[msg.sender]) revert NotEligible();
        if (allocOf[msg.sender].length != 0) revert AlreadyVoted();

        uint256 sum;
        for (uint256 i = 0; i < allocations.length; i++) {
            sum += allocations[i].weightBps;
        }
        if (sum != BPS) revert BadWeights();

        voters.push(msg.sender);
        uint256 power = powerSnapE4[msg.sender];
        for (uint256 i = 0; i < allocations.length; i++) {
            bytes32 a = allocations[i].asset;
            // only registered assets — an unknown symbol would brick lockCycle (executor reverts)
            if (IVaultSnapshot(address(vault)).tokenOf(a) == address(0)) revert UnknownAsset();
            allocOf[msg.sender].push(allocations[i]);
            if (!_assetSeen[a]) {
                _assetSeen[a] = true;
                votedAssets.push(a);
            }
            assetWeightE4[a] += (power * allocations[i].weightBps) / BPS;
        }
        emit Voted(msg.sender, cycleId);
    }

    // -------------------------------------------------------------- selection

    /// @notice Proportional-to-votes basket with a per-position cap and a dust floor; the count
    ///         emerges from the votes (no top-N). Renormalized to ~1e4. See DESIGN §3.
    /// @dev One heavier on-chain loop, but bounded by the votable universe (≈20). Returns empty
    ///      arrays on an empty cycle (no votes) — the Vault then simply sits in cash.
    function selectBasket() public view returns (bytes32[] memory assets, uint256[] memory weights) {
        uint256 n = votedAssets.length;
        uint256 total;
        for (uint256 i = 0; i < n; i++) {
            total += assetWeightE4[votedAssets[i]];
        }
        if (total == 0) return (new bytes32[](0), new uint256[](0));

        uint256 nav = vault.totalAssets();
        bytes32[] memory keptA = new bytes32[](n);
        uint256[] memory keptW = new uint256[](n);
        uint256 kept;
        uint256 sumKept;
        for (uint256 i = 0; i < n; i++) {
            bytes32 a = votedAssets[i];
            uint256 w = (assetWeightE4[a] * BPS) / total; // proportional to votes
            if (w > POSITION_CAP_BPS) w = POSITION_CAP_BPS; // diversification cap
            uint256 posUSDC = (nav * w) / BPS;
            if (DUST_FLOOR_USDC > 0 && posUSDC < DUST_FLOOR_USDC) continue; // anti-dust drop
            keptA[kept] = a;
            keptW[kept] = w;
            sumKept += w;
            kept++;
        }
        if (kept == 0 || sumKept == 0) return (new bytes32[](0), new uint256[](0));

        assets = new bytes32[](kept);
        weights = new uint256[](kept);
        for (uint256 i = 0; i < kept; i++) {
            assets[i] = keptA[i];
            weights[i] = (keptW[i] * BPS) / sumKept; // renormalize survivors to sum ≈ 1e4
        }
    }

    // -------------------------------------------------------------- views

    /// @inheritdoc IGovernance
    function votingPower(address member) external view returns (uint256 powerBps) {
        return totalPowerE4 > 0 ? (powerSnapE4[member] * BPS) / totalPowerE4 : 0;
    }

    /// @inheritdoc IGovernance
    function accuracyOf(address member) external view returns (int256) {
        return accuracyE4[member];
    }

    /// @inheritdoc IGovernance
    function confidenceOf(address member) external view returns (uint256) {
        return _confidenceE4(member);
    }

    /// @notice Fund excess vs S&P this cycle: (NAVnow/navAtLock − benchNow/benchAtLock), signed E4.
    function fundExcessE4() public view returns (int256) {
        uint256 navAtLock = IVaultSnapshot(address(vault)).navAtLock();
        uint256 benchAtLock = IVaultSnapshot(address(vault)).benchAtLock();
        if (navAtLock == 0 || benchAtLock == 0) return 0;
        uint256 navRatioE4 = (vault.totalAssets() * BPS) / navAtLock;
        uint256 benchRatioE4 = (oracle.benchmark() * BPS) / benchAtLock;
        return int256(navRatioE4) - int256(benchRatioE4);
    }

    // -------------------------------------------------------------- tunables (on-site)

    /// @notice Set the dust floor (USDC). Keeper-tunable on stage (DESIGN §2: value TBD).
    function setDustFloor(uint256 v) external onlyKeeper {
        DUST_FLOOR_USDC = v;
    }

    // -------------------------------------------------------------- internal

    function _confidenceE4(address m) internal view returns (uint256) {
        uint256 c = (cyclesParticipated[m] * BPS) / CONFIDENCE_CYCLES;
        return c > BPS ? BPS : c;
    }

    function _resetVotes() internal {
        for (uint256 i = 0; i < votedAssets.length; i++) {
            bytes32 a = votedAssets[i];
            assetWeightE4[a] = 0;
            _assetSeen[a] = false;
        }
        for (uint256 i = 0; i < voters.length; i++) {
            delete allocOf[voters[i]];
        }
        delete votedAssets;
        delete voters;
    }
}
