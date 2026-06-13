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
  "function cyclesParticipated(address member) view returns (uint256)",
  "function memberCount() view returns (uint256)",
  "function members(uint256 index) view returns (address)",
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
  "function balanceOf(address user) view returns (uint256)", // ERC-4626 shares
  "function convertToAssets(uint256 shares) view returns (uint256)", // shares -> USDC at current NAV
  "function deposit(uint256 assets) returns (uint256)",
  "function claimRewards() returns (uint256)",
  "function verify(address user, bytes proof)", // admin-only: attest a World-ID-verified wallet
]);

// Mock USDC / ERC-20. `mint` is the public "get demo USDC" faucet (MockStock).
export const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
]);

// UniswapExecutor (workstream B). The keeper calls repeg() each cycle; UI/keeper read tokenOf().
export const executorAbi = parseAbi([
  "function tokenOf(bytes32 asset) view returns (address)",
  "function repeg(bytes32 asset, uint256 targetPriceE8)",
  "function targetSqrtPriceX96(bytes32 asset, uint256 priceE8) view returns (uint160)",
]);
