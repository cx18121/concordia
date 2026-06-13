// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFundVault — the money contract (ERC-4626 base)
/// @notice Owns ALL money state: USDC custody, shares, NAV, positions, reward pool,
///         high-water mark, claims, and the Uniswap swaps. See docs/CONTRACTS.md §3.
/// @dev Scales: NAV/USDC in USDC's own decimals; excess return tracked in signed E4 (bps).
///      Only Governance may move the basket or fund/settle rewards. Money trust lives here:
///      the reward-pool SIZE is computed from this contract's own NAV, never handed in.
interface IFundVault {
    event Deposited(address indexed user, uint256 assets, uint256 shares);
    event WithdrawRequested(address indexed user, uint256 shares);
    event Withdrawn(address indexed user, uint256 shares, uint256 assets);
    event BasketExecuted(uint256 indexed cycleId);
    event PositionsClosed(uint256 indexed cycleId);
    event RewardsAccrued(uint256 indexed cycleId, uint256 poolUSDC);
    event RewardsClaimed(address indexed user, uint256 amount);

    // ---------------------------------------------------------------- users

    /// @notice Prove unique personhood (World ID, verified off-chain via REST then attested),
    ///         enabling deposit + vote. Impl records the nullifier to enforce one-human-one-account.
    /// @dev Exact params depend on the verification path; kept loose at the interface layer.
    function verify(address user, bytes calldata proof) external;

    /// @notice True once `user` has passed World ID verification.
    function verified(address user) external view returns (bool);

    /// @notice Deposit USDC, mint shares at current NAV. Caller must be verified.
    function deposit(uint256 assets) external returns (uint256 shares);

    /// @notice Queue a redemption; processed at the next cycle boundary (capital epoch-locked).
    function requestWithdraw(uint256 shares) external;

    /// @notice Process a queued withdrawal → USDC back to the user.
    function withdraw() external returns (uint256 assets);

    /// @notice Pull accrued reward credit (claimable USDC) for the caller.
    function claimRewards() external returns (uint256 amount);

    /// @notice Claimable reward balance for `user`.
    function rewardCredit(address user) external view returns (uint256);

    // ---------------------------------------------------------------- views

    /// @notice NAV: USDC balance (excl. reward pool) + Σ position value at ORACLE prices.
    function totalAssets() external view returns (uint256);

    // ------------------------------------------------------------ onlyGovernance

    /// @notice Swap deployable USDC into the winning basket via Uniswap.
    /// @param assets     basket asset symbols
    /// @param weightsBps target weight per asset (bps, sums to 1e4 after cap+renormalize)
    function executeBasket(bytes32[] calldata assets, uint256[] calldata weightsBps) external;

    /// @notice Swap all held stock tokens back to USDC (fund returns to cash).
    function closePositions() external;

    /// @notice Snapshot NAV + benchmark at cycle lock (basis for the cycle's return).
    function recordLock(uint256 nav, uint256 bench) external;

    /// @notice Apply resolution: roll the cumulative excess, and if a new high-water mark is set,
    ///         fund the reward pool (REWARD_POOL_PCT of the realized excess gain, computed here)
    ///         and credit members pro-rata to `creditWeightBps`.
    /// @param cycleExcessE4 this cycle's fund excess return vs S&P, signed bps
    /// @param members       members receiving credit this cycle
    /// @param creditWeightBps each member's share of the positive alpha credit (bps, sums to 1e4)
    function settle(int256 cycleExcessE4, address[] calldata members, uint256[] calldata creditWeightBps) external;
}
