// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IUniswapExecutor — the execution layer (workstream B)
/// @notice Wraps the real Uniswap v4 swaps so the Vault stays clean. The Vault calls this to
///         buy the winning basket and to unwind back to cash. See docs/internal/CONTRACTS.md §7.
/// @dev Built and tested standalone against a stub vault; the Vault integrates it behind
///      executeBasket / closePositions. Swaps route via Universal Router (+Permit2). Pools are
///      gated by the KYCHook (allowlist) — the Vault/executor must be on the allowlist.
///      Swaps execute at POOL price; the Vault values NAV at ORACLE price; CRE re-pegs pools.
interface IUniswapExecutor {
    event SwappedIn(bytes32 indexed asset, uint256 usdcIn, uint256 tokenOut);
    event SwappedOut(bytes32 indexed asset, uint256 tokenIn, uint256 usdcOut);
    event Repegged(bytes32 indexed asset, uint256 targetPriceE8);

    /// @notice Spend `usdcAmount` of USDC to buy `asset`'s mock token; returns tokens received.
    function swapUsdcForToken(bytes32 asset, uint256 usdcAmount) external returns (uint256 tokenOut);

    /// @notice Sell `tokenAmount` of `asset`'s mock token for USDC; returns USDC received.
    function swapTokenForUsdc(bytes32 asset, uint256 tokenAmount) external returns (uint256 usdcOut);

    /// @notice Keeper helper: nudge `asset`'s pool price toward `targetPriceE8` with a small swap,
    ///         keeping the pool ≈ oracle (CRE plays the arbitrageur).
    function repeg(bytes32 asset, uint256 targetPriceE8) external;

    /// @notice The mock ERC-20 token address backing `asset` (0 if not registered).
    function tokenOf(bytes32 asset) external view returns (address);
}
