"use client";

// data.ts — the single mock->live seam every page binds to.
//
// Pages import everything from "@/lib/data". Read hooks return DISPLAY-READY
// values (dollar numbers, percentages) — never on-chain bigints. The live
// adapter (B7) converts E8/bps/E4 -> these same shapes, so pages never change.
//
// Switch: useIsMock() (mode.tsx) — env default, overridable by the in-app toggle.

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
import { useIsMock } from "./mode";
import {
  publicClient,
  UNIVERSE,
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
import {
  LEADERBOARD,
  LEADERBOARD_FRAMES,
  DEMO_CYCLE_ID,
  DEMO_CYCLE_RETURNS,
  DEMO_SPX_RETURN,
  AGENT_MEMBERS,
} from "./demoData";

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
  /** Strategy label (agents) / "Member" (humans on-chain). */
  strategy: string;
  /** Deposited capital in USD. 0 when not derivable (live ERC-4626 reads). */
  capital: number;
  kind: "Agent" | "Human";
}

// The votable universe is the single source of truth in @concordia/shared (18
// assets) — the same set the keeper re-pegs and the deploy seeds, so the UI never
// drifts from what's on-chain. Re-exported so pages keep importing it from here.
export { UNIVERSE };

/**
 * Fund-wide, display-ready statistics for the public pre-join page.
 * These are aggregate (whole-fund) numbers, not the viewer's own position —
 * a non-member can see them before joining. B7 swaps to on-chain reads
 * (totalAssets, member count, cycles resolved, EWMA accuracy aggregate).
 */
export interface FundStats {
  aumUsd: number; // total fund value (assets under management)
  allTimeReturnPct: number; // fund return since inception, %
  spReturnPct: number; // S&P 500 return over the same window, %
  members: number;
  humans: number;
  agents: number;
  cyclesResolved: number;
  avgAccuracy: number; // mean member accuracy, %
  topName: string; // best performer's handle
  topAccuracy: number; // their accuracy, %
}

export type Ticker = (typeof UNIVERSE)[number];

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
  XOM: 114.2,
  UNH: 492.1,
  WMT: 67.34,
  SPY: 543.12,
  QQQ: 470.55,
  XLK: 231.4,
  XLF: 41.2,
  XLE: 91.85,
  XLV: 145.3,
  ARKK: 46.1,
};

// Cycle window: a few minutes out so the countdown is visibly running.
const CYCLE_SECONDS = 5 * 60;

// The leaderboard IS the agent engine's 12-week replay output (agents/src/export-demo.ts) —
// the small-capital, high-skill agent out-ranks the big-capital, mediocre one.
const SEED_LEADERBOARD: LeaderboardRow[] = LEADERBOARD;

// Apply the demo cycle's real weekly returns to a price map; tickers outside the agent
// fixture move with the S&P. Same per-ticker moves the user's vote is scored against.
function applyDemoReturns(prices: Record<Ticker, number>): Record<Ticker, number> {
  const out = { ...prices };
  for (const t of Object.keys(out) as Ticker[]) {
    const r = DEMO_CYCLE_RETURNS[t] ?? DEMO_SPX_RETURN;
    out[t] = Number((out[t] * (1 + r)).toFixed(2));
  }
  return out;
}

// Vote-weighted excess return vs the S&P for the user's own basket — the exact accuracy
// formula the agents are scored by (agents/src/resolve.ts cycleAccuracy). Returns a percent.
function scoreVoteAccuracy(picks: Pick[]): number {
  let acc = 0;
  for (const p of picks) {
    const r = DEMO_CYCLE_RETURNS[p.ticker] ?? 0;
    acc += (p.pct / 100) * (r - DEMO_SPX_RETURN);
  }
  return acc * 100;
}

// Raw (gross) weekly return of the user's basket — drives the NAV bump on resolve.
function scoreVoteReturn(picks: Pick[]): number {
  let raw = 0;
  for (const p of picks) raw += (p.pct / 100) * (DEMO_CYCLE_RETURNS[p.ticker] ?? 0);
  return raw;
}

// The user's voting power as a peer-relative share against the agents — same formula as
// agents/src/resolve.ts votingPower (50% capital share + 50% confidence-scaled accuracy share).
function yourVotingPowerPct(capital: number, accuracyPct: number, cycles: number): number {
  const accuracy = accuracyPct / 100;
  const members = [...AGENT_MEMBERS, { capital, accuracy, cycles }];
  const capTotal = members.reduce((s, m) => s + m.capital, 0) || 1;
  const accTotal = members.reduce((s, m) => s + Math.max(m.accuracy, 0), 0) || 1;
  const conf = Math.min(cycles / 12, 1);
  const vp = 0.5 * (capital / capTotal) + 0.5 * (Math.max(accuracy, 0) / accTotal) * conf;
  return vp * 100;
}

// Whole-fund aggregate shown on the public /welcome page (no per-user data).
const SEED_FUND_STATS: FundStats = {
  aumUsd: 1_284_932,
  allTimeReturnPct: 25.94,
  spReturnPct: 14.6,
  members: 47,
  humans: 41,
  agents: 6,
  cyclesResolved: 128,
  avgAccuracy: 64.8,
  topName: "satoshi.eth",
  topAccuracy: 81.5,
};

interface MockState {
  cycleId: bigint;
  cycleState: CycleState;
  endsAt: number; // epoch ms
  prices: Record<Ticker, number>;
  position: Position;
  accuracy: number | null; // null until resolveCycle() runs
  lastVote: Pick[] | null; // recorded vote, so UI can confirm
  claimed: boolean;
  resolved: boolean;
  leaderboard: LeaderboardRow[];
}

function seedState(): MockState {
  return {
    cycleId: BigInt(DEMO_CYCLE_ID),
    cycleState: "OPEN",
    endsAt: Date.now() + CYCLE_SECONDS * 1000,
    prices: { ...SEED_PRICES },
    position: { shares: 0, navUsd: 0, costUsd: 0, returnPct: 0 },
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
      // Flip OPEN -> LOCKED and score the user's ACTUAL vote against the demo cycle's real
      // weekly returns — same math the agents are scored by. NAV bumps by the basket's gross
      // return; accuracy is its excess vs the S&P; prices move by the same per-ticker amounts.
      const vote = state.lastVote ?? [];
      const navGain = scoreVoteReturn(vote);
      const navUsd = state.position.costUsd * (1 + navGain);
      const returnPct = state.position.costUsd > 0 ? navGain * 100 : 0;
      return {
        ...state,
        cycleState: "LOCKED",
        resolved: true,
        prices: applyDemoReturns(state.prices),
        accuracy: scoreVoteAccuracy(vote),
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
  const isMock = useIsMock();
  const [val, setVal] = useState<T>(initial);
  useEffect(() => {
    if (isMock) return;
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
    // `fetcher` is recreated each render; re-subscribe only when `key`/mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, isMock]);
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
  const USE_MOCK = useIsMock();
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
  const USE_MOCK = useIsMock();
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
  const USE_MOCK = useIsMock();
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
  const USE_MOCK = useIsMock();
  const mock = useContext(MockDataContext);
  const { address } = useAuth();
  const live = useLivePoll<number>(0, address ?? "", async () => {
    if (!address) return 0;
    return Number(await scGetVotingPower(livePub(), address)) / 100;
  });
  if (USE_MOCK) {
    // Reactive: 0 before any deposit, a capital share after, and a jump once accuracy posts.
    const s = mock!.state;
    return yourVotingPowerPct(s.position.costUsd, s.accuracy ?? 0, s.resolved ? 1 : 0);
  }
  return live;
}

/** null until the member has been scored (cyclesParticipated > 0); a percent after. */
export function useAccuracy(): number | null {
  const USE_MOCK = useIsMock();
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

// Leaderboard race playback: in Demo mode the board plays through the agents' 12-week
// replay (LEADERBOARD_FRAMES) so judges watch skill overtake capital — early cycles are
// capital-ordered (ContrarianBot $10k on top), the final frame is skill-ordered (SectorBot
// $2k on top). Advances a frame per RACE_FRAME_MS, holds on the final standings, then loops.
const RACE_FRAME_MS = 1100;
const RACE_HOLD_MS = 4500;

function useRaceFrame(active: boolean): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return;
    let idx = 0;
    let timer: ReturnType<typeof setTimeout>;
    timer = setTimeout(() => setI(0), 0);
    const tick = () => {
      idx += 1;
      if (idx < LEADERBOARD_FRAMES.length) {
        setI(idx);
        timer = setTimeout(tick, RACE_FRAME_MS);
      } else {
        timer = setTimeout(() => {
          idx = 0;
          setI(0);
          timer = setTimeout(tick, RACE_FRAME_MS);
        }, RACE_HOLD_MS);
      }
    };
    timer = setTimeout(tick, RACE_FRAME_MS);
    return () => clearTimeout(timer);
  }, [active]);
  return Math.min(i, LEADERBOARD_FRAMES.length - 1);
}

export interface LeaderboardRace {
  rows: LeaderboardRow[];
  /** 1-based replay cycle being shown (0 in live mode). */
  cycle: number;
  /** Total cycles in the replay (0 in live mode). */
  total: number;
}

export function useLeaderboardRace(): LeaderboardRace {
  const USE_MOCK = useIsMock();
  const frame = useRaceFrame(USE_MOCK);
  const live = useLivePoll<LeaderboardRow[]>([], "leaderboard", async () => {
    const rows = await scGetLeaderboard(livePub());
    return rows.map((r, i) => ({
      rank: i + 1,
      name: shortAddr(r.member),
      votingPowerPct: Number(r.votingPowerBps) / 100,
      accuracy: Number(r.accuracyE4) / 100,
      // Strategy/capital/kind aren't derivable from on-chain reads — humans by default.
      strategy: "Member",
      capital: 0,
      kind: "Human" as const,
    }));
  });
  if (USE_MOCK) {
    return { rows: LEADERBOARD_FRAMES[frame] ?? LEADERBOARD, cycle: frame + 1, total: LEADERBOARD_FRAMES.length };
  }
  return { rows: live, cycle: 0, total: 0 };
}

export function useLeaderboard(): LeaderboardRow[] {
  return useLeaderboardRace().rows;
}

/**
 * Whole-fund aggregate stats for the public pre-join page (no per-user data).
 * No live source yet (B7 swaps to an on-chain aggregate), so the seed serves
 * both mock and live modes — it never touches the data provider.
 */
export function useFundStats(): FundStats {
  return SEED_FUND_STATS;
}

/**
 * True once the viewer has a position in the fund (deposited via /join).
 * Drives the membership gate: non-members see /welcome with no nav; members
 * get the full app and /welcome becomes inaccessible. Delegates to
 * usePosition() so it's correct in both mock and live modes.
 */
export function useHasJoined(): boolean {
  return usePosition().shares > 0;
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
  const USE_MOCK = useIsMock();
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
  }, [USE_MOCK, requireWallet]);

  const deposit = useCallback(
    async (amount: number) => {
      if (USE_MOCK) {
        ctx?.dispatch({ type: "DEPOSIT", amount });
        return;
      }
      await scDeposit(await requireWallet(), BigInt(Math.round(amount * 1e6)));
    },
    [USE_MOCK, ctx, requireWallet],
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
    [USE_MOCK, ctx, requireWallet],
  );

  const claim = useCallback(async () => {
    if (USE_MOCK) {
      ctx?.dispatch({ type: "CLAIM" });
      return;
    }
    await scClaim(await requireWallet());
    setClaimedLive(true);
  }, [USE_MOCK, ctx, requireWallet]);

  const resolveCycle = useCallback(async () => {
    if (USE_MOCK) {
      ctx?.dispatch({ type: "RESOLVE" });
      return;
    }
    // Live: the keeper advances cycles. Ask the backend to step it (see /api/advance).
    await fetch("/api/advance", { method: "POST" }).catch(() => {});
  }, [USE_MOCK, ctx]);

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
