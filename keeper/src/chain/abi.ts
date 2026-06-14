// Keeper-side ABI fragments — the onlyKeeper write fns + the reads the keeper needs that
// @concordia/shared's provisional `governanceAbi` (user/UI-facing) doesn't carry.
//
// Verified 6/13 against the LANDED contracts on main: setPrices, resolveCycle, openCycle, lockCycle,
// accuracyOf, and SyntheticExecutor.repeg all match exactly. The ONLY mismatch is the two array
// views below — the contract stores `voters`/`allocOf` but its auto-getters are index-based
// (no length, no whole-array return), so workstream A must add real array views (docs/internal/ISSUES.md #C1).
// Until then `readResolveInputs()` reverts loudly rather than returning a truncated/silently-wrong set.
//   - Governance.getVoters() returns (address[])       — the voter set to score this cycle
//   - Governance.allocOf(member) returns (Alloc[])     — their backed allocations
import { parseAbi } from "viem";

export const oracleKeeperAbi = parseAbi([
  "function setPrices(bytes32[] assets, uint256[] pricesE8, uint256 spE8)",
  "function price(bytes32 asset) view returns (uint256)",
  "function benchmark() view returns (uint256)",
]);

export const governanceKeeperAbi = parseAbi([
  "struct Alloc { bytes32 asset; uint16 weightBps; }",
  // lifecycle (onlyKeeper)
  "function openCycle()",
  "function lockCycle()",
  "function resolveCycle(address[] members, int256[] newAccuracyE4, uint256[] creditWeightBps)",
  // reads
  "function state() view returns (uint8)",
  "function cycleId() view returns (uint256)",
  "function accuracyOf(address member) view returns (int256)",
  // reads the keeper needs at resolve (ADDITIONS — see header note)
  "function getVoters() view returns (address[])",
  "function allocOf(address member) view returns (Alloc[])",
]);

export const executorKeeperAbi = parseAbi([
  "function repeg(bytes32 asset, uint256 targetPriceE8)",
  "function tokenOf(bytes32 asset) view returns (address)",
]);
