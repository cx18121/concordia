// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

/// @title KYCHook — Uniswap v4 `beforeSwap` allowlist gating the tokenized-stock pools.
/// @notice Story: "tokenized-stock pools enforce on-chain compliance — only a verified, KYC'd fund
///         can trade them." In v4, `beforeSwap`'s `sender` is whoever called `PoolManager.swap()`.
///         Our UniswapExecutor calls the PoolManager DIRECTLY (it is its own router), so `sender`
///         is the executor — and only the executor (the fund's swap arm) is allowlisted. A swap
///         routed through any shared router would show that router as `sender`, so gating only
///         works because the executor swaps directly. See docs/CONTRACTS.md §7 and ISSUES.md.
/// @dev Only the `beforeSwap` flag is set, so add/remove-liquidity (pool seeding) is NOT gated.
///      Must be deployed to a CREATE2 address whose low bits encode exactly BEFORE_SWAP_FLAG
///      (mined via HookMiner) or BaseHook's constructor validation reverts.
contract KYCHook is BaseHook {
    address public owner;
    mapping(address => bool) public allowed;

    error NotOwner();
    error SwapNotAllowed(address sender);

    event AllowSet(address indexed account, bool allowed);
    event OwnerSet(address indexed owner);

    constructor(IPoolManager _poolManager, address _owner) BaseHook(_poolManager) {
        owner = _owner;
        emit OwnerSet(_owner);
    }

    function setAllowed(address account, bool ok) external {
        if (msg.sender != owner) revert NotOwner();
        allowed[account] = ok;
        emit AllowSet(account, ok);
    }

    function setOwner(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        owner = newOwner;
        emit OwnerSet(newOwner);
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function _beforeSwap(address sender, PoolKey calldata, SwapParams calldata, bytes calldata)
        internal
        view
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (!allowed[sender]) revert SwapNotAllowed(sender);
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }
}
