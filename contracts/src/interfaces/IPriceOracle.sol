// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPriceOracle — CRE's on-chain price mailbox
/// @notice The keeper (Chainlink CRE) writes stock + benchmark prices here;
///         Vault reads them for NAV, Governance reads them for fund excess.
/// @dev Prices are 8-decimal USD (E8). `asset` is a short symbol, e.g. bytes32("NVDA").
///      The S&P 500 benchmark is stored separately. See docs/internal/CONTRACTS.md §2.
interface IPriceOracle {
    /// @notice Emitted whenever the keeper posts a fresh price batch.
    event PricesPosted(uint256 indexed cycleId, uint256 timestamp);

    /// @notice Keeper-only. Post the latest prices for `assets` plus the S&P benchmark.
    /// @param assets   parallel array of asset symbols
    /// @param pricesE8 parallel array of 8-decimal USD prices
    /// @param spE8     S&P 500 level, 8 decimals
    function setPrices(bytes32[] calldata assets, uint256[] calldata pricesE8, uint256 spE8) external;

    /// @notice Latest 8-decimal USD price for `asset` (reverts/returns 0 if unset — impl decides).
    function price(bytes32 asset) external view returns (uint256 priceE8);

    /// @notice Latest 8-decimal S&P 500 benchmark level.
    function benchmark() external view returns (uint256 benchmarkE8);

    /// @notice Timestamp of the last price post.
    function lastUpdate() external view returns (uint256);
}
