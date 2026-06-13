// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {PriceOracle} from "../src/PriceOracle.sol";
import {FundVault} from "../src/FundVault.sol";
import {Governance} from "../src/Governance.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {SyntheticExecutor} from "../src/mocks/SyntheticExecutor.sol";
import {IUniswapExecutor} from "../src/interfaces/IUniswapExecutor.sol";

/// @notice Deploys workstream A's core stack (PriceOracle + FundVault + Governance) wired together,
///         with mock USDC + a demo stock universe, ready for the keeper (C) to drive a full cycle.
/// @dev Uses the SyntheticExecutor (trades at oracle price) until workstream B's real Uniswap v4
///      executor lands. To deploy against B's executor instead, set EXECUTOR to its address — the
///      script skips the synthetic one and registers nothing on it (B owns its pool/token set).
///
///      Env:
///        PRIVATE_KEY  (required) deployer = admin = the account that runs setup calls
///        KEEPER       (optional) CRE keeper address; defaults to the deployer
///        EXECUTOR     (optional) an existing IUniswapExecutor (B's); else deploy SyntheticExecutor
///        MINT_USDC    (optional) demo USDC (whole units, 6dp applied) to mint to the deployer
///
///      Run (Base Sepolia):
///        forge script script/DeployCore.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
contract DeployCoreScript is Script {
    // demo universe — 8 tickers is plenty for the stage (ROADMAP B). Mirrors @concordia/shared UNIVERSE head.
    string[8] internal TICKERS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "JPM"];

    function run() public {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address keeper = vm.envOr("KEEPER", deployer);
        address executorEnv = vm.envOr("EXECUTOR", address(0));
        uint256 mintUsdc = vm.envOr("MINT_USDC", uint256(0));

        vm.startBroadcast(pk);

        // money + oracle
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        PriceOracle oracle = new PriceOracle(keeper);

        // core (deployer is admin → can run the set-once wiring below)
        FundVault vault = new FundVault(usdc, oracle, deployer);
        Governance gov = new Governance(vault, oracle, keeper);
        vault.setGovernance(address(gov));

        // execution layer: B's real executor if given, else the synthetic one
        IUniswapExecutor executor;
        SyntheticExecutor synth;
        if (executorEnv != address(0)) {
            executor = IUniswapExecutor(executorEnv);
        } else {
            synth = new SyntheticExecutor(address(usdc), oracle);
            executor = synth;
        }
        vault.setExecutor(executor);

        // register the demo universe (only meaningful with the synthetic executor + our mocks)
        for (uint256 i = 0; i < TICKERS.length; i++) {
            bytes32 sym = bytes32(bytes(TICKERS[i]));
            MockERC20 stock = new MockERC20(
                string.concat("Mock ", TICKERS[i]), string.concat("m", TICKERS[i]), 18
            );
            vault.registerAsset(sym, address(stock));
            if (address(synth) != address(0)) synth.register(sym, address(stock));
            console2.log(TICKERS[i], address(stock));
        }

        if (mintUsdc > 0) usdc.mint(deployer, mintUsdc * 1e6);

        vm.stopBroadcast();

        console2.log("--- core deployed ---");
        console2.log("USDC      ", address(usdc));
        console2.log("PriceOracle", address(oracle));
        console2.log("FundVault ", address(vault));
        console2.log("Governance", address(gov));
        console2.log("Executor  ", address(executor));
        console2.log("keeper    ", keeper);
        console2.log("admin     ", deployer);
    }
}
