// Keeper-side ABI fragments — the onlyKeeper write fns + the reads CRE needs that @chf/shared's
// provisional `governanceAbi` (user/UI-facing) doesn't carry. Function shapes come from the frozen
// interfaces in contracts/src/interfaces/*.sol; swap for generated ABIs after `forge build`.
//
// ⚠️ Two of these are ADDITIONS the frozen interfaces don't yet expose (see docs/ISSUES.md #C1):
//   - Governance.getVoters()        — CRE can't recompute per-member accuracy without the voter set
//   - Governance.allocOf(member)    — …or their backed allocations
// Workstream A must add them (cheap views over existing storage) for the keeper to resolve on-chain.
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
