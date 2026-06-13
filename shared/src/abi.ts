import { parseAbi } from "viem";

// Provisional fragments hand-written from contracts/src/interfaces/*.sol.
// Replace/extend with the generated ABIs (contracts/out/) once `forge build` runs —
// the function shapes match, so call sites won't change.

export const governanceAbi = parseAbi([
  "struct Alloc { bytes32 asset; uint16 weightBps; }",
  "function cycleId() view returns (uint256)",
  "function state() view returns (uint8)",
  "function votingPower(address member) view returns (uint256)",
  "function accuracyOf(address member) view returns (int256)",
  "function confidenceOf(address member) view returns (uint256)",
  "function castVote(Alloc[] allocations)",
]);

export const oracleAbi = parseAbi([
  "function price(bytes32 asset) view returns (uint256)",
  "function benchmark() view returns (uint256)",
]);

export const vaultAbi = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function verified(address user) view returns (bool)",
  "function rewardCredit(address user) view returns (uint256)",
  "function deposit(uint256 assets) returns (uint256)",
  "function claimRewards() returns (uint256)",
]);
