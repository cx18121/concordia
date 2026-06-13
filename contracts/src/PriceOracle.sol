// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @title PriceOracle — the keeper's on-chain price mailbox
/// @notice Chainlink CRE (the keeper) writes stock + S&P prices here every cycle;
///         the Vault reads them for NAV and Governance reads them for fund excess.
///         Trivial by design — it is the only thing CRE writes prices into.
///         See docs/CONTRACTS.md §2.
/// @dev Prices are 8-decimal USD (E8). `asset` is a short symbol, e.g. bytes32("NVDA").
contract PriceOracle is IPriceOracle {
    /// @notice The CRE keeper, the only address allowed to post prices.
    address public immutable keeper;

    mapping(bytes32 => uint256) private _priceE8;
    uint256 private _benchmarkE8;

    /// @inheritdoc IPriceOracle
    uint256 public lastUpdate;

    error NotKeeper();
    error LengthMismatch();

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    constructor(address keeper_) {
        keeper = keeper_;
    }

    /// @inheritdoc IPriceOracle
    function setPrices(bytes32[] calldata assets, uint256[] calldata pricesE8, uint256 spE8) external onlyKeeper {
        if (assets.length != pricesE8.length) revert LengthMismatch();
        for (uint256 i = 0; i < assets.length; i++) {
            _priceE8[assets[i]] = pricesE8[i];
        }
        _benchmarkE8 = spE8;
        lastUpdate = block.timestamp;
        // cycleId is informational here; Governance owns the canonical counter.
        emit PricesPosted(0, block.timestamp);
    }

    /// @inheritdoc IPriceOracle
    function price(bytes32 asset) external view returns (uint256) {
        return _priceE8[asset];
    }

    /// @inheritdoc IPriceOracle
    function benchmark() external view returns (uint256) {
        return _benchmarkE8;
    }
}
