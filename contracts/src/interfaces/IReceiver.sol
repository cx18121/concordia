// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

/// @title IReceiver — Chainlink KeystoneForwarder report sink (CRE write path, ISSUES #C2).
/// @notice The CRE workflow does NOT call the keeper functions directly. It emits a DON report that
///         Chainlink's KeystoneForwarder delivers by calling `onReport(metadata, report)` on the
///         target contract. `report` is the abi-encoded payload from keeper/src/core/encode.ts; each
///         contract decodes its own shape and runs the same logic as its `onlyKeeper` EOA function.
/// @dev The always-on Bun heartbeat bypasses this entirely and calls the `onlyKeeper` functions as a
///      plain EOA — both drivers stay wired, and they are never live at the same time.
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
