// One source of truth for deployed addresses. Live + verified on Base Sepolia; the
// deploy script (forge) rewrites this after each deployment.
export const CHAIN_ID = 84532; // Base Sepolia

export const addresses = {
  governance: "0x16205875989dC061368A30E7F1B2604D9F5200CF",
  vault: "0x4C0E3CfB0B743378146D3797b656a4Df72e7fd40",
  oracle: "0x65BB0F2C28F6627F89F6190d05ABBAcEF1c65a34",
  executor: "0x26d8a89d00Bb9F63BfFBd73A11BC249F79935DEf", // UniswapExecutor (workstream B)
  kycHook: "0xf7b58A34b3587475e8E47260396D102Ce4d54080", // KYCHook, mined CREATE2 address (workstream B)
  usdc: "0xD79b4a790A3a5B46A4936B623625d8386672a329", // mock USDC, deployed by us
  poolManager: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408", // Uniswap v4 PoolManager (verified)
} as const satisfies Record<string, `0x${string}`>;

// Mock stock tokens, one per ticker (workstream B deploy fills these in). The pool for each is
// `<token>/USDC` with KYCHook attached; the executor resolves them via its on-chain registry too.
export const stockTokens: Record<string, `0x${string}`> = {
  AAPL: "0x55eabE6361dA3805FaD39002703eD9a2001FD3f3",
  MSFT: "0x853F787B4DaFf26411C38a4A1443bE7dd3d6aac4",
  NVDA: "0xe7b3Ce11432f31b8D8C603BD54Be6d534B6b60C0",
  GOOGL: "0x873AD7f90052285f63d21cd5309BeBF35C1a7FEA",
  AMZN: "0xd0F3e85c9AD29ef40E7675C99A08dD52373e1a01",
  META: "0xbCB9fa127c6e842D1E286511d579BEA9E75E382f",
  TSLA: "0x9A1aee15E0c73fb49c7572154399e2b5444086E2",
  JPM: "0x2Ef3578C59A70e67C6b19e761F0f805fDF28538E",
  XOM: "0x110d3607faC80e18a966B2Dd73a39830FD10Cbea",
  UNH: "0xE5a28b22373995fDd02740a5b6aB28575f2Cc7FB",
  WMT: "0x450D8412F83d70c925b7433C97f11E67523dACc9",
  SPY: "0x965034DE4DA8f4043D59d6F1fe74585A858B84e5",
  QQQ: "0x2ec946532D452aea60710E8793F00762Add6Ce2E",
  XLK: "0x2F58Fcc352253cc909b2f44Aa32dE35a4B3464d4",
  XLF: "0x1E07112E7A079d27B643474674D93736876B17f5",
  XLE: "0x89953dA5d2B9aA731353d3B53f94150505F21570",
  XLV: "0x5BaA109341478be88E6D52A8348357cFa1bBFfDD",
  ARKK: "0xA7d71EEFd63b60490adab2C3703333a492DDf613",
};
