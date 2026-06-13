// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IUniswapExecutor} from "../interfaces/IUniswapExecutor.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";
import {MockERC20} from "./MockERC20.sol";

/// @title SyntheticExecutor — an IUniswapExecutor that trades at the ORACLE price
/// @notice Lets the whole fund cycle (deposit→open→vote→lock→resolve→claim) be tested and demoed
///         before workstream B's real Uniswap v4 layer lands. The Vault is identical against either:
///         it just calls IUniswapExecutor. Swap in B's executor at integration — no Vault rework.
/// @dev Synthetic because it trades at the oracle price (no pool, no slippage, no drift) and MINTS
///      realized P&L: when a position closes higher than it opened, the extra USDC is minted (the
///      "market" pays out), so settle()/rewards are backed by real USDC in tests. Only valid with
///      our mock tokens (we hold mint rights). NOT a production contract.
contract SyntheticExecutor is IUniswapExecutor {
    IPriceOracle public immutable oracle;
    address public immutable usdc;
    uint8 private immutable _usdcDecimals;

    mapping(bytes32 => address) public tokenOf;

    error UnknownAsset();

    constructor(address usdc_, IPriceOracle oracle_) {
        usdc = usdc_;
        oracle = oracle_;
        _usdcDecimals = IERC20Metadata(usdc_).decimals();
    }

    /// @notice Register an asset's mock token (setup only; mirrors the real executor's pool set).
    function register(bytes32 asset, address token) external {
        tokenOf[asset] = token;
    }

    /// @inheritdoc IUniswapExecutor
    function swapUsdcForToken(bytes32 asset, uint256 usdcAmount) external returns (uint256 tokenOut) {
        address token = tokenOf[asset];
        if (token == address(0)) revert UnknownAsset();
        IERC20(usdc).transferFrom(msg.sender, address(this), usdcAmount);

        // tokens such that value(tokenOut) == usdcAmount at the oracle price
        uint256 usdE8 = Math.mulDiv(usdcAmount, 1e8, 10 ** _usdcDecimals);
        tokenOut = Math.mulDiv(usdE8, 10 ** IERC20Metadata(token).decimals(), oracle.price(asset));

        MockERC20(token).mint(msg.sender, tokenOut);
        emit SwappedIn(asset, usdcAmount, tokenOut);
    }

    /// @inheritdoc IUniswapExecutor
    function swapTokenForUsdc(bytes32 asset, uint256 tokenAmount) external returns (uint256 usdcOut) {
        address token = tokenOf[asset];
        if (token == address(0)) revert UnknownAsset();
        IERC20(token).transferFrom(msg.sender, address(this), tokenAmount);

        uint256 usdE8 = Math.mulDiv(tokenAmount, oracle.price(asset), 10 ** IERC20Metadata(token).decimals());
        usdcOut = Math.mulDiv(usdE8, 10 ** _usdcDecimals, 1e8);

        uint256 bal = IERC20(usdc).balanceOf(address(this));
        if (bal < usdcOut) MockERC20(usdc).mint(address(this), usdcOut - bal); // realized gain
        IERC20(usdc).transfer(msg.sender, usdcOut);
        emit SwappedOut(asset, tokenAmount, usdcOut);
    }

    /// @inheritdoc IUniswapExecutor
    /// @dev No-op: a synthetic pool is always at the oracle price, so there is nothing to re-peg.
    function repeg(bytes32 asset, uint256 targetPriceE8) external {
        emit Repegged(asset, targetPriceE8);
    }
}
