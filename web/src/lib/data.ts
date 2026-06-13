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
import { useAuth } from "./useAuth";
import {
  publicClient,
  getCycle as scGetCycle,
  getPrices as scGetPrices,
  getPosition as scGetPosition,
  getVotingPower as scGetVotingPower,
  getAccuracy as scGetAccuracy,
  getCyclesParticipated as scGetCycles,
  getLeaderboard as scGetLeaderboard,
  getRewardCredit as scGetRewardCredit,
  getDemoUSDC as scGetDemoUSDC,
  deposit as scDeposit,
  claim as scClaim,
  buildAllocs as scBuildAllocs,
  castVote as scCastVote,
} from "@concordia/shared";

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

// ===========================================================================
// Live adapter — reads deployed contracts via @concordia/shared. Each read hook
// is self-contained (polls on its own interval), so live mode needs NO data
// provider in layout.tsx — only the auth provider for writes. Reads use the
// public RPC (no key); writes use useAuth().getWalletClient() (Dynamic).
// ===========================================================================

const POLL_MS = 6000;
const ZERO_POSITION: Position = { shares: 0, navUsd: 0, costUsd: 0, returnPct: 0 };

/** Poll `fetcher` on an interval (live mode only); re-poll when `key` changes. */
function useLivePoll<T>(initial: T, key: string, fetcher: () => Promise<T>): T {
  const [val, setVal] = useState<T>(initial);
  useEffect(() => {
    if (USE_MOCK) return;
    let alive = true;
    const run = () => {
      fetcher()
        .then((v) => alive && setVal(v))
        .catch(() => {});
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // `fetcher` is recreated each render; only re-subscribe when `key` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return val;
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// web and shared resolve separate (identical-version) viem copies; cast the client
// to the exact type the shared read helpers expect to bridge the nominal mismatch.
const livePub = () => publicClient() as unknown as Parameters<typeof scGetCycle>[0];

// ===========================================================================
// Public surface — pages import these. Each branches mock vs live on USE_MOCK.
// Read hooks return display-ready values; write actions return Promises.
// ===========================================================================

export function useCycle(): Cycle {
  const mock = useContext(MockDataContext);
  const live = useLivePoll<Cycle>({ id: BigInt(0), state: "IDLE", secondsLeft: 0 }, "cycle", async () => {
    const c = await scGetCycle(livePub());
    // No on-chain phase-end timestamp, so secondsLeft isn't derivable live.
    return { id: c.id, state: c.state as CycleState, secondsLeft: 0 };
  });
  if (USE_MOCK) {
    if (!mock) throw new Error("MockDataProvider missing — mount it in layout.tsx");
    return { id: mock.state.cycleId, state: mock.state.cycleState, secondsLeft: mock.secondsLeft };
  }
  return live;
}

export function usePrices(): Record<string, number> {
  const mock = useContext(MockDataContext);
  const live = useLivePoll<Record<string, number>>({}, "prices", async () => {
    const e8 = await scGetPrices(livePub(), UNIVERSE);
    const out: Record<string, number> = {};
    for (const [t, v] of Object.entries(e8)) out[t] = Number(v) / 1e8;
    return out;
  });
  if (USE_MOCK) return mock!.state.prices;
  return live;
}

export function usePosition(): Position {
  const mock = useContext(MockDataContext);
  const { address } = useAuth();
  const live = useLivePoll<Position>(ZERO_POSITION, address ?? "", async () => {
    if (!address) return ZERO_POSITION;
    const { shares, navUsd } = await scGetPosition(livePub(), address);
    const nav = Number(navUsd) / 1e6;
    // Cost basis isn't tracked on-chain (ERC-4626) — show NAV as cost (0% delta).
    return { shares: Number(shares) / 1e6, navUsd: nav, costUsd: nav, returnPct: 0 };
  });
  if (USE_MOCK) return mock!.state.position;
  return live;
}

export function useVotingPower(): number {
  const mock = useContext(MockDataContext);
  const { address } = useAuth();
  const live = useLivePoll<number>(0, address ?? "", async () => {
    if (!address) return 0;
    return Number(await scGetVotingPower(livePub(), address)) / 100;
  });
  if (USE_MOCK) return mock!.state.votingPowerPct;
  return live;
}

/** null until the member has been scored (cyclesParticipated > 0); a percent after. */
export function useAccuracy(): number | null {
  const mock = useContext(MockDataContext);
  const { address } = useAuth();
  const live = useLivePoll<number | null>(null, address ?? "", async () => {
    if (!address) return null;
    const pub = livePub();
    if ((await scGetCycles(pub, address)) === BigInt(0)) return null;
    return Number(await scGetAccuracy(pub, address)) / 100;
  });
  if (USE_MOCK) return mock!.state.accuracy;
  return live;
}

export function useLeaderboard(): LeaderboardRow[] {
  const mock = useContext(MockDataContext);
  const live = useLivePoll<LeaderboardRow[]>([], "leaderboard", async () => {
    const rows = await scGetLeaderboard(livePub());
    return rows.map((r, i) => ({
      rank: i + 1,
      name: shortAddr(r.member),
      votingPowerPct: Number(r.votingPowerBps) / 100,
      accuracy: Number(r.accuracyE4) / 100,
    }));
  });
  if (USE_MOCK) return mock!.state.leaderboard;
  return live;
}

export interface FundActions {
  getDemoUSDC(): Promise<void>;
  deposit(amount: number): Promise<void>;
  castVote(allocs: Pick[]): Promise<void>;
  claim(): Promise<void>;
  /** Mock: resolve the cycle locally. Live: POST the keeper's advance route. */
  resolveCycle(): Promise<void>;
  /** Mock: cycle resolved. Live: you have a claimable reward balance. */
  canClaim: boolean;
  /** True once claim() has run. */
  claimed: boolean;
  /** The last recorded vote, so the UI can confirm it. */
  lastVote: Pick[] | null;
}

export function useFundActions(): FundActions {
  // Always call hooks (rules of hooks); the unused branch's values are ignored.
  const ctx = useContext(MockDataContext);
  const { address, getWalletClient } = useAuth();
  const [claimedLive, setClaimedLive] = useState(false);
  const [lastVoteLive, setLastVoteLive] = useState<Pick[] | null>(null);
  const rewardCredit = useLivePoll<bigint>(BigInt(0), address ?? "", async () =>
    address ? scGetRewardCredit(livePub(), address) : BigInt(0),
  );

  const requireWallet = useCallback(async () => {
    const w = await getWalletClient();
    if (!w) throw new Error("Connect a wallet first.");
    // web and shared resolve separate (identical-version) viem copies; cast to the
    // shared write helpers' WalletClient type to bridge the nominal mismatch.
    return w as unknown as Parameters<typeof scDeposit>[0];
  }, [getWalletClient]);

  const getDemoUSDC = useCallback(async () => {
    if (USE_MOCK) return; // mock: deposit() supplies the funds directly
    await scGetDemoUSDC(await requireWallet(), BigInt(10_000_000_000)); // 10,000 demo USDC
  }, [requireWallet]);

  const deposit = useCallback(
    async (amount: number) => {
      if (USE_MOCK) {
        ctx?.dispatch({ type: "DEPOSIT", amount });
        return;
      }
      await scDeposit(await requireWallet(), BigInt(Math.round(amount * 1e6)));
    },
    [ctx, requireWallet],
  );

  const castVote = useCallback(
    async (allocs: Pick[]) => {
      if (USE_MOCK) {
        ctx?.dispatch({ type: "VOTE", picks: allocs });
        return;
      }
      await scCastVote(await requireWallet(), scBuildAllocs(allocs));
      setLastVoteLive(allocs);
    },
    [ctx, requireWallet],
  );

  const claim = useCallback(async () => {
    if (USE_MOCK) {
      ctx?.dispatch({ type: "CLAIM" });
      return;
    }
    await scClaim(await requireWallet());
    setClaimedLive(true);
  }, [ctx, requireWallet]);

  const resolveCycle = useCallback(async () => {
    if (USE_MOCK) {
      ctx?.dispatch({ type: "RESOLVE" });
      return;
    }
    // Live: the keeper advances cycles. Ask the backend to step it (see /api/advance).
    await fetch("/api/advance", { method: "POST" }).catch(() => {});
  }, [ctx]);

  return {
    getDemoUSDC,
    deposit,
    castVote,
    claim,
    resolveCycle,
    canClaim: USE_MOCK ? Boolean(ctx?.state.resolved) : rewardCredit > BigInt(0),
    claimed: USE_MOCK ? Boolean(ctx?.state.claimed) : claimedLive,
    lastVote: USE_MOCK ? ctx?.state.lastVote ?? null : lastVoteLive,
  };
}
