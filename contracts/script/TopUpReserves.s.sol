// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {MockStock} from "../src/MockStock.sol";
import {UniswapExecutor} from "../src/UniswapExecutor.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";

/// @notice Replenish the executor's per-pool repeg reserve (both currencies). `repeg()` swaps from
///         this reserve to nudge a pool back to the oracle price each cycle; a sustained one-way
///         trend in the replay drains one side over many cycles, after which repeg quietly becomes a
///         partial no-op and the pool drifts off-peg (ISSUES #6). Run this before/occasionally during
///         a long unattended demo. It does NOT add pool liquidity (~100k/pool is plenty for the
///         demo's fund size) — only the executor's own reserve.
/// @dev Pure mint (MockStock.mint is public), so it's permissionless and re-runnable as often as you
///      like — no redeploy. For each ticker it mints `TOPUP_USDC` USDC plus the SAME USD value of the
///      stock at the current oracle price, keeping the reserve balanced. If the oracle hasn't posted a
///      price yet (price == 0), that ticker is skipped (re-run after the keeper's first tick).
///
///      Env (all optional; default to the current Base Sepolia deploy):
///        EXECUTOR    UniswapExecutor address
///        ORACLE      PriceOracle address
///        TOPUP_USDC  USDC (raw, 6dp) to add per pool, per side  (default 200_000e6)
///
///      Run:
///        forge script script/TopUpReserves.s.sol --tc TopUpReservesScript \
///          --rpc-url base_sepolia --private-key $PK --broadcast
contract TopUpReservesScript is Script {
    uint256 constant N = 18;
    string[N] TICKERS = [
        "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "JPM", "XOM",
        "UNH", "WMT", "SPY", "QQQ", "XLK", "XLF", "XLE", "XLV", "ARKK"
    ];

    function run() external {
        address executor = vm.envOr("EXECUTOR", 0x26d8a89d00Bb9F63BfFBd73A11BC249F79935DEf);
        address oracleAddr = vm.envOr("ORACLE", 0x65BB0F2C28F6627F89F6190d05ABBAcEF1c65a34);
        uint256 topUpUsdc = vm.envOr("TOPUP_USDC", uint256(200_000e6));

        UniswapExecutor exec = UniswapExecutor(executor);
        IPriceOracle oracle = IPriceOracle(oracleAddr);
        MockStock usdc = MockStock(exec.usdc());

        vm.startBroadcast();

        uint256 skipped;
        for (uint256 i = 0; i < N; i++) {
            bytes32 asset = bytes32(bytes(TICKERS[i]));
            address token = exec.tokenOf(asset);
            if (token == address(0)) {
                skipped++;
                continue; // pool not registered on this executor
            }
            uint256 priceE8 = oracle.price(asset);
            if (priceE8 == 0) {
                console.log("skip (no oracle price yet):", TICKERS[i]);
                skipped++;
                continue;
            }

            usdc.mint(executor, topUpUsdc); // USDC side
            uint256 tokenAmt = (topUpUsdc * 1e20) / priceE8; // same USD value at the oracle price
            MockStock(token).mint(executor, tokenAmt); // stock side
            console.log(TICKERS[i], "topped up");
        }

        vm.stopBroadcast();

        console.log("--- reserves topped up ---");
        console.log("executor      ", executor);
        console.log("per-pool USDC ", topUpUsdc);
        console.log("pools skipped ", skipped);
    }
}
