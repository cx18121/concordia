// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockStock — reusable mintable ERC-20 standing in for a tokenized stock (or mock USDC).
/// @notice Public `mint` so we can seed pools generously and so a "get demo USDC" button works.
///         Decimals are configurable: deploy stocks at 18, USDC at 6 (matches real USDC for a
///         mainnet drop-in). Interface stays identical to a real Dinari/xStocks token, so on
///         mainnet these instances swap out for the real thing with no contract changes.
/// @dev Anyone can mint — fine for a testnet demo, never for production.
contract MockStock is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint `amount` (raw units) to `to`. Public on purpose — see contract notice.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
