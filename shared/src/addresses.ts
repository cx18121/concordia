// One source of truth for deployed addresses. The deploy script (forge) rewrites this
// after deployment; our contracts are 0x0 placeholders until then.
export const CHAIN_ID = 84532; // Base Sepolia

export const addresses = {
  governance: "0x0000000000000000000000000000000000000000",
  vault: "0x0000000000000000000000000000000000000000",
  oracle: "0x0000000000000000000000000000000000000000",
  executor: "0x0000000000000000000000000000000000000000",
  usdc: "0x0000000000000000000000000000000000000000", // mock USDC, deployed by us
  poolManager: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408", // Uniswap v4 PoolManager (verified)
} as const satisfies Record<string, `0x${string}`>;
