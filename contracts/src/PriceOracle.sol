// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";

/// @title PriceOracle — the keeper's on-chain price mailbox
/// @notice Chainlink CRE (the keeper) writes stock + S&P prices here every cycle;
///         the Vault reads them for NAV and Governance reads them for fund excess.
///         Trivial by design — it is the only thing CRE writes prices into.
///         See docs/internal/CONTRACTS.md §2.
/// @dev Prices are 8-decimal USD (E8). `asset` is a short symbol, e.g. bytes32("NVDA").
///      Two write drivers, never live at once (ISSUES #C2): the Bun heartbeat calls `setPrices`
///      directly as the keeper EOA; the CRE workflow delivers a DON report that the KeystoneForwarder
///      hands to `onReport`. Both converge on `_setPrices`.
contract PriceOracle is IPriceOracle, IReceiver {
    /// @notice The CRE keeper, the only address allowed to post prices.
    address public immutable keeper;
    /// @notice The trusted KeystoneForwarder for the CRE report path (0 = CRE path disabled).
    address public forwarder;

    mapping(bytes32 => uint256) private _priceE8;
    uint256 private _benchmarkE8;

    /// @inheritdoc IPriceOracle
    uint256 public lastUpdate;

    error NotKeeper();
    error NotForwarder();
    error LengthMismatch();

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    constructor(address keeper_) {
        keeper = keeper_;
    }

    /// @notice Point the CRE report path at the KeystoneForwarder. Keeper-only (it owns this contract).
    function setForwarder(address forwarder_) external onlyKeeper {
        forwarder = forwarder_;
    }

    /// @inheritdoc IPriceOracle
    function setPrices(bytes32[] calldata assets, uint256[] calldata pricesE8, uint256 spE8) external onlyKeeper {
        _setPrices(assets, pricesE8, spE8);
    }

    /// @inheritdoc IReceiver
    /// @dev CRE price path. `report` = encodePricesReport: (bytes32[] assets, uint256[] pricesE8, uint256 spE8).
    function onReport(bytes calldata, bytes calldata report) external {
        if (msg.sender != forwarder) revert NotForwarder();
        (bytes32[] memory assets, uint256[] memory pricesE8, uint256 spE8) =
            abi.decode(report, (bytes32[], uint256[], uint256));
        _setPrices(assets, pricesE8, spE8);
    }

    function _setPrices(bytes32[] memory assets, uint256[] memory pricesE8, uint256 spE8) internal {
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
