// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20 — mintable test token with configurable decimals
/// @notice Stands in for USDC (6 dp) and the tokenized stocks (18 dp) on testnet.
///         `mint()` is public on purpose: it doubles as the "get demo USDC" button
///         and lets us seed pools / the synthetic executor generously (ISSUES #2, #6).
///         Interface is plain ERC-20 so a mainnet drop-in (real USDC / Dinari) is a
///         constructor-arg swap, no contract change. See docs/internal/CONTRACTS.md §7.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}
