// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IGovernance — the rules contract (Voting + Reputation)
/// @notice Owns votes, the voting-power snapshot, accuracy scores, basket selection,
///         and the cycle lifecycle. See docs/CONTRACTS.md §4.
/// @dev Scales: accuracy signed E4, power/weights bps. Lifecycle fns are keeper-triggered
///      (CRE) for the demo. The selection count EMERGES from votes (proportional + cap + dust),
///      there is no fixed top-N.
interface IGovernance {
    /// @dev A member's allocation of their voting power across one asset.
    struct Alloc {
        bytes32 asset;
        uint16 weightBps; // share of this member's power on `asset`; a member's allocs sum to 1e4
    }

    enum State { IDLE, OPEN, LOCKED }

    event CycleOpened(uint256 indexed cycleId);
    event Voted(address indexed member, uint256 indexed cycleId);
    event CycleLocked(uint256 indexed cycleId);
    event CycleResolved(uint256 indexed cycleId);

    // -------------------------------------------------------------- lifecycle (keeper)

    /// @notice Open a cycle: snapshot every member's voting power
    ///         (= CAPITAL_BPS·capitalShare + ACCURACY_BPS·accuracyShare·confidence) and reset votes.
    function openCycle() external;

    /// @notice Tally votes → proportional basket (cap + dust floor + renormalize) and execute it
    ///         on the Vault; snapshot NAV + benchmark for the cycle. Transitions OPEN → LOCKED.
    function lockCycle() external;

    /// @notice Resolve a cycle. Keeper supplies the off-chain-computed per-member figures;
    ///         this contract computes fund-level excess on-chain and drives Vault.settle().
    /// @param members         members updated this cycle
    /// @param newAccuracyE4   each member's new EWMA-smoothed accuracy (signed E4)
    /// @param creditWeightBps each member's share of positive realized-alpha credit (bps)
    function resolveCycle(
        address[] calldata members,
        int256[] calldata newAccuracyE4,
        uint256[] calldata creditWeightBps
    ) external;

    // -------------------------------------------------------------- users

    /// @notice Cast a weighted allocation across assets. Caller must be verified;
    ///         only valid while state == OPEN; weights must sum to 1e4.
    function castVote(Alloc[] calldata allocations) external;

    // -------------------------------------------------------------- views

    function state() external view returns (State);
    function cycleId() external view returns (uint256);

    /// @notice Snapshotted voting power for `member` this cycle (bps of total).
    function votingPower(address member) external view returns (uint256 powerBps);

    /// @notice `member`'s smoothed accuracy (signed E4). Read by the forum + UI.
    function accuracyOf(address member) external view returns (int256);

    /// @notice `member`'s confidence ramp (bps, 0..1e4) = min(cycles / CONFIDENCE_CYCLES, 1).
    function confidenceOf(address member) external view returns (uint256);
}
