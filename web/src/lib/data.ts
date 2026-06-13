"use client";

// data.ts — the single mock->live seam every page binds to.
//
// Pages import everything from "@/lib/data". Read hooks return DISPLAY-READY
// values (dollar numbers, percentages) — never on-chain bigints. The live
// adapter (B7) converts E8/bps/E4 -> these same shapes, so pages never change.
//
// Switch: NEXT_PUBLIC_USE_MOCK !== "false" => mock (default). No .env required.

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types (mirror @concordia/shared locally — web/ can't resolve the workspace
// yet, so these are defined here; B7 swaps to imports from @concordia/shared).
// ---------------------------------------------------------------------------

export type CycleState = "IDLE" | "OPEN" | "LOCKED";

/** Mirrors @concordia/shared Cycle. UI adds display-ready secondsLeft. */
export interface Cycle {
  id: bigint;
  state: CycleState;
  /** Live-ticking seconds until the cycle ends (derived from endsAt). */
  secondsLeft: number;
}

/** Mirrors @concordia/shared Pick — a human-facing vote row (pct 0–100). */
export interface Pick {
  ticker: string;
  pct: number;
}

/** Mirrors @concordia/shared Alloc — the on-chain unit a vote compiles to. */
export interface Alloc {
  asset: `0x${string}`;
  weightBps: number;
}

/** Display-ready member position. All USD numbers, not bigints. */
export interface Position {
  shares: number;
  navUsd: number;
  costUsd: number;
  returnPct: number;
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  votingPowerPct: number;
  accuracy: number;
}

// The votable universe — B5's vote page binds to this. A UI subset of ~8.
export const UNIVERSE = [
  "AAPL",
  "MSFT",
  "NVDA",
  "GOOGL",
  "AMZN",
  "META",
  "TSLA",
  "JPM",
] as const;

export type Ticker = (typeof UNIVERSE)[number];

// ---------------------------------------------------------------------------
// Env switch
// ---------------------------------------------------------------------------

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

// ===========================================================================
// Mock adapter — seeded state in a client provider mounted in layout.tsx.
// State is shared across routes (root layout persists across client nav), so
// a deposit on / shows up in the position on Overview, and castVote +
// resolveCycle on /vote make accuracy + claim appear.
// ===========================================================================

// Seeded, realistic USD prices for the 8-ticker universe.
const SEED_PRICES: Record<Ticker, number> = {
  AAPL: 229.87,
  MSFT: 467.21,
  NVDA: 131.45,
  GOOGL: 178.34,
  AMZN: 201.66,
  META: 591.08,
  TSLA: 342.19,
  JPM: 248.73,
};

// Resolved prices the dev trigger flips to — drives the NAV bump on resolve.
const RESOLVED_PRICES: Record<Ticker, number> = {
  AAPL: 236.4,
  MSFT: 479.9,
  NVDA: 142.1,
  GOOGL: 181.2,
  AMZN: 207.3,
  META: 604.5,
  TSLA: 333.0,
  JPM: 251.1,
};

// Cycle window: a few minutes out so the countdown is visibly running.
const CYCLE_SECONDS = 5 * 60;

const SAMPLE_ACCURACY = 72.4; // % shown after resolve.

const SEED_LEADERBOARD: LeaderboardRow[] = [
  { rank: 1, name: "satoshi.eth", votingPowerPct: 18.2, accuracy: 81.5 },
  { rank: 2, name: "vitalik.eth", votingPowerPct: 14.7, accuracy: 77.9 },
  { rank: 3, name: "you", votingPowerPct: 9.3, accuracy: 72.4 },
  { rank: 4, name: "0xCafe…91Bd", votingPowerPct: 7.1, accuracy: 68.0 },
  { rank: 5, name: "degenfund.eth", votingPowerPct: 5.4, accuracy: 61.2 },
];

interface MockState {
  cycleId: bigint;
  cycleState: CycleState;
  endsAt: number; // epoch ms
  prices: Record<Ticker, number>;
  position: Position;
  votingPowerPct: number; // display-ready percent
  accuracy: number | null; // null until resolveCycle() runs
  lastVote: Pick[] | null; // recorded vote, so UI can confirm
  claimed: boolean;
  resolved: boolean;
  leaderboard: LeaderboardRow[];
}

function seedState(): MockState {
  return {
    cycleId: BigInt(7),
    cycleState: "OPEN",
    endsAt: Date.now() + CYCLE_SECONDS * 1000,
    prices: { ...SEED_PRICES },
    position: { shares: 0, navUsd: 0, costUsd: 0, returnPct: 0 },
    votingPowerPct: 9.3,
    accuracy: null,
    lastVote: null,
    claimed: false,
    resolved: false,
    leaderboard: SEED_LEADERBOARD,
  };
}

type Action =
  | { type: "DEPOSIT"; amount: number }
  | { type: "VOTE"; picks: Pick[] }
  | { type: "CLAIM" }
  | { type: "RESOLVE" };

// 1 share == $1 at seed; deposit grows shares/cost 1:1, NAV tracks cost
// until resolve bumps it. Keeps the demo math obvious.
function reducer(state: MockState, action: Action): MockState {
  switch (action.type) {
    case "DEPOSIT": {
      const shares = state.position.shares + action.amount;
      const costUsd = state.position.costUsd + action.amount;
      // Before resolve NAV == cost; after resolve preserve the gained ratio.
      const navUsd = state.resolved
        ? state.position.navUsd + action.amount
        : costUsd;
      const returnPct =
        costUsd > 0 ? ((navUsd - costUsd) / costUsd) * 100 : 0;
      return {
        ...state,
        position: { shares, navUsd, costUsd, returnPct },
      };
    }
    case "VOTE":
      return { ...state, lastVote: action.picks };
    case "CLAIM":
      // Available only after resolve; no-op otherwise.
      return state.resolved ? { ...state, claimed: true } : state;
    case "RESOLVE": {
      if (state.resolved) return state;
      // Flip OPEN -> LOCKED, bump NAV from the new (resolved) prices, and
      // surface a sample accuracy so useAccuracy() returns a real number.
      const NAV_GAIN = 0.061; // +6.1% from the resolved-price move.
      const navUsd = state.position.costUsd * (1 + NAV_GAIN);
      const returnPct = state.position.costUsd > 0 ? NAV_GAIN * 100 : 0;
      return {
        ...state,
        cycleState: "LOCKED",
        resolved: true,
        prices: { ...RESOLVED_PRICES },
        accuracy: SAMPLE_ACCURACY,
        position: { ...state.position, navUsd, returnPct },
      };
    }
    default:
      return state;
  }
}

interface MockContextValue {
  state: MockState;
  secondsLeft: number;
  dispatch: React.Dispatch<Action>;
}

const MockDataContext = createContext<MockContextValue | null>(null);

export function MockDataProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, seedState);

  // Live-ticking countdown lives here so components just read a number.
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000)),
  );

  const endsAt = state.endsAt;
  useEffect(() => {
    const tick = () =>
      setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick(); // resync immediately when endsAt changes.
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const value = useMemo<MockContextValue>(
    () => ({ state, secondsLeft, dispatch }),
    [state, secondsLeft],
  );

  // createElement (not JSX) keeps this a .ts file — no .tsx needed.
  return createElement(MockDataContext.Provider, { value }, children);
}

// Read context unconditionally (rules of hooks), then assert. In mock mode the
// provider is always mounted; in live mode the read hooks never reach the
// assertion because the live branch throws "not wired" first.
function useMockContext(): MockContextValue {
  const ctx = useContext(MockDataContext);
  if (USE_MOCK && !ctx) {
    throw new Error("MockDataProvider missing — mount it in layout.tsx");
  }
  return ctx as MockContextValue;
}

// ===========================================================================
// Live adapter — STUB. B7 fills this in once web/ can resolve @concordia/shared.
//
// B7 wiring (do not implement here):
//   useCycle()        -> getCycle(publicClient())          -> { id, state }, derive secondsLeft from endsAt
//   usePrices()       -> getPrices(publicClient())         -> Record<string,bigint> E8, /1e8 to dollars
//   usePosition()     -> getPosition/convertToAssets(...)  -> shares + NAV/cost USD, returnPct
//   useVotingPower()  -> getVotingPower(publicClient())    -> bigint bps, /100 to percent
//   useAccuracy()     -> getAccuracy(publicClient())       -> signed E4 bigint, /100 to percent (null if unscored)
//   useLeaderboard()  -> getLeaderboard(publicClient())    -> rows (votingPowerPct, accuracy)
//   getDemoUSDC()     -> faucet/mint via getWalletClient()
//   deposit(amount)   -> vault.deposit  via getWalletClient()
//   castVote(allocs)  -> castVote(allocs) via getWalletClient()  (Alloc[] = on-chain bps unit)
//   claim()           -> claimRewards    via getWalletClient()
// Writes use useAuth().getWalletClient(); reads use publicClient().
// ===========================================================================

const LIVE_NOT_WIRED = "live adapter not wired — see B7";

function liveNotWired(): never {
  throw new Error(LIVE_NOT_WIRED);
}

// ===========================================================================
// Public surface — pages import these. Each branches mock vs live on USE_MOCK.
// Read hooks return display-ready values; write actions return Promises.
// ===========================================================================

export function useCycle(): Cycle {
  const { state, secondsLeft } = useMockContext();
  if (!USE_MOCK) return liveNotWired();
  return { id: state.cycleId, state: state.cycleState, secondsLeft };
}

export function usePrices(): Record<string, number> {
  const { state } = useMockContext();
  if (!USE_MOCK) return liveNotWired();
  return state.prices;
}

export function usePosition(): Position {
  const { state } = useMockContext();
  if (!USE_MOCK) return liveNotWired();
  return state.position;
}

export function useVotingPower(): number {
  const { state } = useMockContext();
  if (!USE_MOCK) return liveNotWired();
  return state.votingPowerPct;
}

/** null until the cycle resolves; a sample percent afterwards. */
export function useAccuracy(): number | null {
  const { state } = useMockContext();
  if (!USE_MOCK) return liveNotWired();
  return state.accuracy;
}

export function useLeaderboard(): LeaderboardRow[] {
  const { state } = useMockContext();
  if (!USE_MOCK) return liveNotWired();
  return state.leaderboard;
}

export interface FundActions {
  getDemoUSDC(): Promise<void>;
  deposit(amount: number): Promise<void>;
  castVote(allocs: Pick[]): Promise<void>;
  claim(): Promise<void>;
  /** Dev trigger (mock only): resolve the cycle so accuracy + claim appear. */
  resolveCycle(): Promise<void>;
  /** Has the cycle resolved? Gates the claim affordance in the UI. */
  canClaim: boolean;
  /** True once claim() has run. */
  claimed: boolean;
  /** The last recorded vote, so the UI can confirm it. */
  lastVote: Pick[] | null;
}

export function useFundActions(): FundActions {
  // Always call the hook (rules of hooks); the live branch ignores the value.
  const ctx = useContext(MockDataContext);

  const getDemoUSDC = useCallback(async () => {
    if (!USE_MOCK) liveNotWired();
    // Mock: demo USDC is a no-op; deposit() supplies the funds directly.
  }, []);

  const deposit = useCallback(
    async (amount: number) => {
      if (!USE_MOCK) liveNotWired();
      ctx?.dispatch({ type: "DEPOSIT", amount });
    },
    [ctx],
  );

  const castVote = useCallback(
    async (allocs: Pick[]) => {
      if (!USE_MOCK) liveNotWired();
      ctx?.dispatch({ type: "VOTE", picks: allocs });
    },
    [ctx],
  );

  const claim = useCallback(async () => {
    if (!USE_MOCK) liveNotWired();
    ctx?.dispatch({ type: "CLAIM" });
  }, [ctx]);

  const resolveCycle = useCallback(async () => {
    if (!USE_MOCK) liveNotWired();
    ctx?.dispatch({ type: "RESOLVE" });
  }, [ctx]);

  return {
    getDemoUSDC,
    deposit,
    castVote,
    claim,
    resolveCycle,
    canClaim: USE_MOCK ? Boolean(ctx?.state.resolved) : false,
    claimed: USE_MOCK ? Boolean(ctx?.state.claimed) : false,
    lastVote: USE_MOCK ? ctx?.state.lastVote ?? null : null,
  };
}
