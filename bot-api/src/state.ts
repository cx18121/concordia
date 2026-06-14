import { UNIVERSE, type Ticker } from "./universe.js";

/**
 * Cycle clock + market snapshot the API serves to bots. In the real system these come from the
 * Governance contract (state/cycleId/votingPower) and the PriceOracle (prices the CRE keeper
 * wrote). Here they're an in-process mock so the API runs standalone; the shapes match so the
 * read paths can be swapped to on-chain views without changing the API surface.
 */

export type Phase = "OPEN" | "LOCKED" | "IDLE";

const CYCLE_MS = Number(process.env.CYCLE_MS ?? 5 * 60 * 1000); // demo: 5-min cycles
const VOTING_WINDOW_MS = Math.floor(CYCLE_MS * 0.4);

const startedAt = Date.now();

export interface Clock {
  cycle: number;
  phase: Phase;
  votingClosesInMs: number;
  nextCycleInMs: number;
  isOpen: boolean;
  replayWeek: string;
  serverTime: string;
}

export function clock(): Clock {
  const elapsed = Date.now() - startedAt;
  const cycle = Math.floor(elapsed / CYCLE_MS) + 1;
  const intoCycle = elapsed % CYCLE_MS;
  const isOpen = intoCycle < VOTING_WINDOW_MS;
  return {
    cycle,
    phase: isOpen ? "OPEN" : "LOCKED",
    votingClosesInMs: Math.max(0, VOTING_WINDOW_MS - intoCycle),
    nextCycleInMs: CYCLE_MS - intoCycle,
    isOpen,
    replayWeek: "Feb 12, 2024",
    serverTime: new Date().toISOString(),
  };
}

// representative oracle prices (E2 → display dollars); swap for PriceOracle.priceOf reads
const PRICES: Record<Ticker, number> = {
  mNVDA: 631.18,
  mMSFT: 415.3,
  mAAPL: 187.42,
  mTSLA: 219.9,
  mAMZN: 181.55,
  mGOOGL: 153.78,
  mMETA: 484.1,
  mJPM: 186.2,
};

export function universeWithPrices() {
  return UNIVERSE.map((u) => ({
    asset: u.ticker,
    name: u.name,
    price: PRICES[u.ticker],
  }));
}

/** Mock per-wallet account snapshot — replace with Vault + Governance views. */
export function accountFor(wallet: `0x${string}`) {
  return {
    wallet,
    verified: true,
    usdcBalance: 1000,
    shares: 940.2,
    votingPowerBps: 1740, // 17.4% — from Governance.votingPower(member)
    accuracyE4: 1180,     // +0.118 — from Governance.accuracyOf(member)
    confidenceBps: 10000, // from Governance.confidenceOf(member)
    claimableUsdc: 412,
  };
}
