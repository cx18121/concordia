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
  useRef,
  useState,
  useSyncExternalStore,
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

/** A single fund holding — the basket shown on Overview + Account (same data,
 * same UI). Click a row to expand its detail; nothing navigates away. */
export interface Holding {
  ticker: string;
  company: string;
  weightPct: number; // allocation as a % of the fund
  perfPct: number; // trailing 1-month performance, %
  accent: string; // tailwind avatar bg/text classes
  blurb: string; // one-line thesis shown when the row is expanded
}

// ---------------------------------------------------------------------------
// Fund basket — the fund always holds exactly 10 names, re-picked every cycle as
// the top performers of its investable universe. Because it holds the BEST 10
// (weighted top-heavy), the basket's blended return always beats the equal-weight
// market benchmark — that gap IS the fund's alpha. The selection rotates round to
// round, so the "Fund Composition" table on Overview + Account changes over time.
// ---------------------------------------------------------------------------

// Per-asset display metadata (company name, avatar accent, one-line thesis).
const STOCK_META: Record<string, { company: string; accent: string; blurb: string }> = {
  NVDA: { company: "Nvidia", accent: "bg-teal/20 text-teal", blurb: "AI/GPU leader — the fund's highest-conviction compute bet." },
  MSFT: { company: "Microsoft", accent: "bg-cyan-500/20 text-cyan-400", blurb: "Cloud + Copilot compounder; the steady anchor of the basket." },
  AAPL: { company: "Apple", accent: "bg-blue-500/20 text-blue-400", blurb: "Hardware + services franchise with the deepest install base." },
  META: { company: "Meta", accent: "bg-indigo-500/20 text-indigo-400", blurb: "Ad-spend recovery plus disciplined AI capex — a momentum re-rate." },
  AMZN: { company: "Amazon", accent: "bg-orange-500/20 text-orange-400", blurb: "AWS reacceleration and retail-margin expansion." },
  GOOGL: { company: "Alphabet", accent: "bg-sky-500/20 text-sky-400", blurb: "Search resilience + Gemini; the cheapest of the megacaps." },
  TSLA: { company: "Tesla", accent: "bg-red-500/20 text-red-400", blurb: "EV + autonomy optionality; the basket's high-beta sleeve." },
  JPM: { company: "JPMorgan", accent: "bg-emerald-500/20 text-emerald-400", blurb: "Financials ballast with a net-interest-income tailwind." },
  XOM: { company: "ExxonMobil", accent: "bg-amber-500/20 text-amber-400", blurb: "Energy hedge — uncorrelated cash flow when rates bite." },
  UNH: { company: "UnitedHealth", accent: "bg-violet-500/20 text-violet-400", blurb: "Defensive healthcare compounder with pricing power." },
  WMT: { company: "Walmart", accent: "bg-blue-400/20 text-blue-300", blurb: "Defensive retail + ads optionality; low-beta ballast." },
  XLK: { company: "Tech Sector", accent: "bg-cyan-400/20 text-cyan-300", blurb: "Broad technology sleeve — diversified semis + software." },
  XLF: { company: "Financials", accent: "bg-emerald-400/20 text-emerald-300", blurb: "Banks + insurers basket; a rate-cycle play." },
  XLE: { company: "Energy", accent: "bg-amber-400/20 text-amber-300", blurb: "Energy sector basket — inflation and supply hedge." },
  XLV: { company: "Health Care", accent: "bg-rose-400/20 text-rose-300", blurb: "Defensive health-care sleeve; low-drawdown profile." },
  ARKK: { company: "ARK Innovation", accent: "bg-pink-500/20 text-pink-400", blurb: "High-growth innovation sleeve — the basket's risk-on tilt." },
  SPY: { company: "S&P 500 ETF", accent: "bg-slate-400/20 text-slate-300", blurb: "Broad-market beta." },
  QQQ: { company: "Nasdaq 100 ETF", accent: "bg-purple-500/20 text-purple-400", blurb: "Large-cap growth beta." },
};

// The fund picks from everything investable EXCEPT the broad-index ETFs (those
// ARE the benchmark, not an active pick).
const FUND_POOL: Ticker[] = (UNIVERSE as readonly Ticker[]).filter(
  (t) => t !== "SPY" && t !== "QQQ",
) as Ticker[];

// Top-heavy conviction weights for the 10 chosen names (sum = 100).
const FUND_WEIGHTS = [21, 17, 14, 11, 9, 7.5, 6.5, 5.5, 4.5, 4];
const FUND_SIZE = FUND_WEIGHTS.length;

// Long-run return tilt per asset (so megacaps usually — not always — lead),
// before per-cycle noise. Keeps the rotating basket recognisable.
const TICKER_DRIFT: Record<string, number> = {
  NVDA: 0.03, META: 0.024, MSFT: 0.02, AMZN: 0.017, ARKK: 0.016, GOOGL: 0.015,
  XLK: 0.014, TSLA: 0.013, AAPL: 0.012, WMT: 0.009, UNH: 0.008, JPM: 0.008,
  XLV: 0.007, XLF: 0.006, XOM: 0.005, XLE: 0.004,
};

// Deterministic [0,1) hash from (cycle, index) — no Date/Math.random at module
// scope so server and client render the same basket (no hydration mismatch).
function hash01(cycle: number, i: number): number {
  const x = Math.sin((cycle + 1) * 12.9898 + (i + 1) * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// A single asset's realised return for a cycle: long-run drift ± per-cycle noise.
function tickerCycleReturn(cycle: number, ticker: string): number {
  const i = Math.max(0, (UNIVERSE as readonly string[]).indexOf(ticker));
  const drift = TICKER_DRIFT[ticker] ?? 0.008;
  const noise = (hash01(cycle, i) - 0.5) * 0.07; // ±3.5 pts
  return drift + noise;
}

// The benchmark ("S&P") = equal-weight mean of the investable pool that cycle.
// The fund holds the BEST 10 of that pool, so it beats this by construction.
function marketReturn(cycle: number): number {
  let s = 0;
  for (const t of FUND_POOL) s += tickerCycleReturn(cycle, t);
  return s / FUND_POOL.length;
}

// The fund's 10-name basket for a cycle: top performers, top-heavy weights.
function fundBasket(cycle: number): Holding[] {
  const ranked = [...FUND_POOL]
    .map((t) => ({ t, r: tickerCycleReturn(cycle, t) }))
    .sort((a, b) => b.r - a.r)
    .slice(0, FUND_SIZE);
  return ranked.map((x, idx) => {
    const meta = STOCK_META[x.t] ?? { company: x.t, accent: "bg-white/10 text-text-primary", blurb: "" };
    return {
      ticker: x.t,
      company: meta.company,
      weightPct: FUND_WEIGHTS[idx],
      perfPct: x.r * 100,
      accent: meta.accent,
      blurb: meta.blurb,
    };
  });
}

// The fund's blended return for a cycle = Σ weightᵢ × assetᵢ return (fraction).
function fundCycleReturn(cycle: number): number {
  let r = 0;
  for (const h of fundBasket(cycle)) r += (h.weightPct / 100) * (h.perfPct / 100);
  return r;
}

// 20% of the fund's positive alpha each cycle is skimmed from NAV into the reward
// pool (matches Governance.REWARD_POOL_PCT); the rest grows everyone's shares.
const REWARD_POOL_PCT = 0.2;

// One cycle's NAV growth = the fund's return minus the 20% alpha skim.
function navGrowthForCycle(cycle: number): number {
  const fr = fundCycleReturn(cycle);
  return fr - REWARD_POOL_PCT * Math.max(fr - marketReturn(cycle), 0);
}

// The fund has a track record BEFORE you join (the rest of the fund has been
// running for cycles). Compound the basket's realised returns over the cycles
// preceding the current one, so NAV/share, the S&P index, and the alpha between
// them all reflect real history the moment you arrive — derived from the same
// basket math as the live cycles, so nothing can drift.
const SEED_HISTORY_CYCLES = 9;
function seedTrackRecord(): { navPerShare: number; spxIndex: number } {
  let navPerShare = 1;
  let spxIndex = 1;
  for (let c = DEMO_CYCLE_ID - SEED_HISTORY_CYCLES; c < DEMO_CYCLE_ID; c++) {
    navPerShare *= 1 + navGrowthForCycle(c);
    spxIndex *= 1 + marketReturn(c);
  }
  return { navPerShare, spxIndex };
}

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

// Move a price map by each ticker's realised return this cycle — the same
// per-asset moves the user's vote is scored against, so prices and scores agree.
function applyCycleReturns(prices: Record<Ticker, number>, cycle: number): Record<Ticker, number> {
  const out = { ...prices };
  for (const t of Object.keys(out) as Ticker[]) {
    out[t] = Number((out[t] * (1 + tickerCycleReturn(cycle, t))).toFixed(2));
  }
  return out;
}

// Gross weekly return of the user's own basket this cycle (fraction).
function scoreVoteReturn(picks: Pick[], cycle: number): number {
  let raw = 0;
  for (const p of picks) raw += (p.pct / 100) * tickerCycleReturn(cycle, p.ticker);
  return raw;
}

// Vote-weighted excess return vs the benchmark for the user's own basket — the
// accuracy formula the agents are scored by (agents/src/resolve.ts). Returns a percent.
function scoreVoteAccuracy(picks: Pick[], cycle: number): number {
  return (scoreVoteReturn(picks, cycle) - marketReturn(cycle)) * 100;
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

// Peer benchmark — mean agent "alpha" (excess return vs the S&P) across the demo
// peer set, in the SAME percentage units as useAccuracy()/scoreVoteAccuracy().
// Lets the vote page compare your accuracy against peers on a like-for-like
// scale, instead of the 0–100 community skill score shown on the public page.
export const PEER_AVG_ACCURACY_PCT =
  (AGENT_MEMBERS.reduce((s, m) => s + m.accuracy, 0) / AGENT_MEMBERS.length) * 100;

// Fund headline figures shown on the public /welcome page are DERIVED so the
// landing page can never drift from the rest of the app. The return is the
// basket's weight-weighted performance and the benchmark is the same cycle's
// market mean (so the headline shows the same positive alpha as the Account
// stats); AUM is the fund's real current value; accuracy is the member win-rate.
const HEADLINE_CYCLE = DEMO_CYCLE_ID; // the seed cycle the trailing-window figures use

// The fund's REAL current AUM — the rest-of-fund base (every member except you)
// plus a representative ~$1k active position — so the public number matches the
// ~$43.8K shown in-app, not an inflated notional. Reused by seedState() as the
// seed otherAum. The return stat below reports the basket's performance; AUM is
// the resulting value, so the two are consistent without double-counting.
const OTHER_AUM_BASE = 42_820;
export const TOTAL_FUND_AUM_USD = OTHER_AUM_BASE + 1_000; // ≈ $43.8K

// "Member accuracy" = the share of the member cohort beating the benchmark
// (positive alpha), from the agent peer set — a real win-rate, not a magic number.
const MEMBER_WIN_RATE_PCT =
  Math.round(
    (AGENT_MEMBERS.filter((m) => m.accuracy > 0).length / AGENT_MEMBERS.length) * 1000,
  ) / 10;

/** Weight-weighted trailing-window return of the current basket, in percent. */
export function fundBasketReturnPct(): number {
  return Math.round(fundCycleReturn(HEADLINE_CYCLE) * 1e4) / 100;
}

/** The benchmark return over the same window, percent (always below the fund). */
function spBenchmarkReturnPct(): number {
  return Math.round(marketReturn(HEADLINE_CYCLE) * 1e4) / 100;
}

// Whole-fund aggregate shown on the public /welcome page (no per-user data).
const SEED_FUND_STATS: FundStats = {
  // AUM is the fund's real current value; return + S&P reflect the basket.
  aumUsd: TOTAL_FUND_AUM_USD,
  allTimeReturnPct: fundBasketReturnPct(),
  spReturnPct: spBenchmarkReturnPct(),
  members: 47,
  humans: 41,
  agents: 6,
  cyclesResolved: 128,
  avgAccuracy: MEMBER_WIN_RATE_PCT,
  topName: LEADERBOARD[0].name,
  topAccuracy: LEADERBOARD[0].accuracy,
};

interface MockState {
  cycleId: bigint;
  cycleState: CycleState;
  endsAt: number; // epoch ms
  prices: Record<Ticker, number>;
  position: Position;
  // ---- fund economics (shared NAV; everyone rides it) ----
  otherAum: number; // value of the rest of the fund (all members except you)
  navPerShare: number; // fund NAV per share (1.0 at inception)
  spxIndex: number; // S&P benchmark index (1.0 at inception)
  rewardEarned: number; // your cumulative reward credits (your share of 20% of alpha)
  cyclesPlayed: number; // resolved cycles you participated in
  accuracy: number | null; // your EWMA forecast accuracy, % (null until first resolve)
  lastVote: Pick[] | null; // recorded vote, so UI can confirm
  claimed: boolean;
  resolved: boolean;
  leaderboard: LeaderboardRow[];
}

function seedState(): MockState {
  // The fund's pre-join history (positive alpha) — NAV/share + S&P start from the
  // fund's track record, not a flat 1.0, so the stats reflect real performance.
  const { navPerShare, spxIndex } = seedTrackRecord();
  return {
    cycleId: BigInt(DEMO_CYCLE_ID),
    cycleState: "OPEN",
    endsAt: Date.now() + CYCLE_SECONDS * 1000,
    prices: { ...SEED_PRICES },
    position: { shares: 0, navUsd: 0, costUsd: 0, returnPct: 0 },
    otherAum: OTHER_AUM_BASE,
    navPerShare,
    spxIndex,
    rewardEarned: 0,
    cyclesPlayed: 0,
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
  | { type: "RESOLVE" }
  | { type: "NEW_CYCLE" };

// Pooled ERC-4626 model: deposits buy shares at the current NAV/share; everyone
// (you + the rest of the fund) rides the same NAV. On resolve the fund's NAV
// grows by its return MINUS 20% of the alpha (REWARD_POOL_PCT, defined above) —
// that alpha is paid out to accurate members as reward credits (DESIGN.md
// §"Fees & rewards"). Your position and the total fund move together, the fund
// "loses" 20% of alpha from NAV, and you earn it back (more if you're accurate).

function reducer(state: MockState, action: Action): MockState {
  switch (action.type) {
    case "DEPOSIT": {
      // Buy shares at the current NAV; value = shares × NAV. Total fund AUM grows
      // by the deposit (otherAum is untouched; your position adds on top).
      const shares = state.position.shares + action.amount / state.navPerShare;
      const costUsd = state.position.costUsd + action.amount;
      const navUsd = shares * state.navPerShare;
      const returnPct = costUsd > 0 ? (navUsd / costUsd - 1) * 100 : 0;
      return { ...state, position: { shares, navUsd, costUsd, returnPct } };
    }
    case "VOTE":
      return { ...state, lastVote: action.picks };
    case "CLAIM":
      // Available only after resolve; no-op otherwise.
      return state.resolved ? { ...state, claimed: true } : state;
    case "NEW_CYCLE":
      // Roll over to a fresh OPEN cycle: bump the id, reset the countdown + prices,
      // clear the per-cycle vote so you can vote again. The fund economics
      // (NAV/share, S&P, AUM, reward, accuracy EWMA) all carry across cycles.
      return {
        ...state,
        cycleId: state.cycleId + BigInt(1),
        cycleState: "OPEN",
        endsAt: Date.now() + CYCLE_SECONDS * 1000,
        prices: { ...SEED_PRICES },
        lastVote: null,
        resolved: false,
        claimed: false,
      };
    case "RESOLVE": {
      if (state.resolved) return state;
      const cycle = Number(state.cycleId);
      // The FUND runs its own 10-name basket — its NAV grows by the fund's return
      // whether or not you voted (the fund beats the benchmark by construction).
      // 20% of the fund's positive alpha is skimmed from NAV into the reward pool;
      // the rest grows everyone's shares. spxIndex tracks the same benchmark.
      const market = marketReturn(cycle); // fraction (the "S&P")
      const navGrowth = navGrowthForCycle(cycle); // fund return minus 20% alpha skim

      const navPerShare = state.navPerShare * (1 + navGrowth);
      const spxIndex = state.spxIndex * (1 + market);
      const otherAum = state.otherAum * (1 + navGrowth);

      const navBefore = state.position.shares * state.navPerShare;
      const navUsd = state.position.shares * navPerShare; // your position rides NAV
      const returnPct =
        state.position.costUsd > 0 ? (navUsd / state.position.costUsd - 1) * 100 : 0;

      // YOUR reward = 20% of the alpha YOUR vote generated on your position. Beat
      // the benchmark and you earn back more than the NAV skim costs you; sit out
      // (no vote) and you still ride the fund's NAV but earn nothing — accuracy is
      // what's rewarded. Accuracy EWMA only updates on a cycle you actually voted.
      const vote = state.lastVote ?? [];
      const voted = vote.length > 0;
      const userAlpha = voted ? scoreVoteReturn(vote, cycle) - market : 0;
      const rewardEarned =
        state.rewardEarned + REWARD_POOL_PCT * Math.max(userAlpha, 0) * navBefore;

      const cycleAcc = scoreVoteAccuracy(vote, cycle); // percent
      const accuracy = !voted
        ? state.accuracy
        : state.accuracy == null
          ? cycleAcc
          : 0.25 * cycleAcc + 0.75 * state.accuracy;

      return {
        ...state,
        cycleState: "LOCKED",
        resolved: true,
        prices: applyCycleReturns(state.prices, cycle),
        navPerShare,
        spxIndex,
        otherAum,
        rewardEarned,
        cyclesPlayed: state.cyclesPlayed + 1,
        accuracy,
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

// "View demo" lands a visitor on a populated portfolio instead of $0. Sized so the
// injected "You" row starts mid-pack on the leaderboard and climbs as accuracy proves
// out (a $1k newcomer would sit last on capital alone — VP is 50% capital).
const DEMO_DEPOSIT_USDC = 10000;

export function MockDataProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, seedState);

  // Auto-fund the demo position once a visitor enters via "View demo". Reads the
  // persisted demo flag, so a page reload (which resets the in-memory mock state)
  // re-funds too. Guarded on shares===0 so it never stacks on a real deposit; the
  // ref guards against React StrictMode's double-invoke.
  const demoEntered = useDemoEntered();
  const demoFunded = useRef(false);
  useEffect(() => {
    if (demoEntered && !demoFunded.current && state.position.shares === 0) {
      demoFunded.current = true;
      dispatch({ type: "DEPOSIT", amount: DEMO_DEPOSIT_USDC });
    }
  }, [demoEntered, state.position.shares]);

  // Live-ticking countdown lives here so components just read a number.
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000)),
  );

  const endsAt = state.endsAt;
  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      // Always-on: when the clock runs out, roll straight into a new cycle.
      // NEW_CYCLE sets a fresh endsAt, so this effect re-subscribes and the
      // next tick reads the full window — only one rollover fires per cycle.
      if (remaining <= 0) dispatch({ type: "NEW_CYCLE" });
    };
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

/** The fund's current 10-name basket, re-picked each cycle (rotates as rounds
 * advance). Single source for the shared "Fund Composition" table on Overview +
 * Account. Reads useCycle() so it re-renders when the cycle rolls over. */
export function useFundBasket(): Holding[] {
  const { id } = useCycle();
  const cycle = Number(id);
  return useMemo(() => fundBasket(cycle), [cycle]);
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
    // Reactive: capital share from your live position value (min = your deposit),
    // plus the accuracy share that ramps with cycles played. Grows when you deposit.
    const s = mock!.state;
    return yourVotingPowerPct(s.position.navUsd, s.accuracy ?? 0, s.cyclesPlayed);
  }
  return live;
}

/** Display-ready whole-fund totals: AUM, NAV/share, S&P benchmark, alpha, your share. */
export interface FundTotals {
  aum: number; // total fund value (your position + everyone else)
  navPerShare: number;
  navPct: number; // NAV/share gain since inception, %
  spxIndex: number;
  spxPct: number; // S&P gain since inception, %
  alphaPct: number; // NAV outperformance vs the S&P, %
  positionPct: number; // your position as a % of the fund
}

export function useFundTotals(): FundTotals {
  const USE_MOCK = useIsMock();
  const mock = useContext(MockDataContext);
  if (!USE_MOCK || !mock) {
    // Live total-fund reads aren't wired (B7); return inert zeros off the mock path.
    return { aum: 0, navPerShare: 1, navPct: 0, spxIndex: 1, spxPct: 0, alphaPct: 0, positionPct: 0 };
  }
  const s = mock.state;
  const aum = s.otherAum + s.position.navUsd;
  return {
    aum,
    navPerShare: s.navPerShare,
    navPct: (s.navPerShare - 1) * 100,
    spxIndex: s.spxIndex,
    spxPct: (s.spxIndex - 1) * 100,
    alphaPct: (s.navPerShare - s.spxIndex) * 100,
    positionPct: aum > 0 ? (s.position.navUsd / aum) * 100 : 0,
  };
}

/** Your cumulative reward earned (your share of 20% of alpha), in USD. */
export function useRewardEarned(): number {
  const USE_MOCK = useIsMock();
  const mock = useContext(MockDataContext);
  if (!USE_MOCK || !mock) return 0;
  return mock.state.rewardEarned;
}

/** Resolved cycles you've participated in. */
export function useCyclesPlayed(): number {
  const USE_MOCK = useIsMock();
  const mock = useContext(MockDataContext);
  if (!USE_MOCK || !mock) return 0;
  return mock.state.cyclesPlayed;
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

// Leaderboard standings: in Demo mode the board reflects the agents' 12-week replay
// (LEADERBOARD_FRAMES) advanced by YOUR play — the frame index tracks cyclesPlayed, so
// each vote you resolve on the Vote page steps the board one week (early weeks are
// capital-ordered, the final week skill-ordered). Your own row is injected and ranked
// among the agents by voting power, so you watch yourself climb as accuracy proves out.
// Live mode shows the on-chain leaderboard, static.

export interface LeaderboardRace {
  rows: LeaderboardRow[];
  /** 1-based replay cycle being shown (0 in live mode). */
  cycle: number;
  /** Total cycles in the replay (0 in live mode). */
  total: number;
}

export function useLeaderboardRace(): LeaderboardRace {
  const USE_MOCK = useIsMock();
  const mock = useContext(MockDataContext);
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
  if (USE_MOCK && mock) {
    const total = LEADERBOARD_FRAMES.length;
    const s = mock.state;
    // Frame tracks cycles you've resolved: 0 played → week-1 standings, climbing to
    // the final week after 12. Clamp so extra cycles hold on the last week.
    const frame = Math.min(s.cyclesPlayed, total - 1);
    const agentRows = LEADERBOARD_FRAMES[frame] ?? LEADERBOARD;
    // Inject your own row — same VP formula as the "Your standing" card (useVotingPower)
    // so the card and the table agree — then re-sort + re-rank the whole board.
    const youRow: LeaderboardRow = {
      rank: 0,
      name: "You",
      strategy: "Your basket",
      kind: "Human",
      capital: Math.round(s.position.navUsd),
      votingPowerPct: yourVotingPowerPct(s.position.navUsd, s.accuracy ?? 0, s.cyclesPlayed),
      accuracy: s.accuracy ?? 0,
    };
    const rows = [...agentRows, youRow]
      .sort((a, b) => b.votingPowerPct - a.votingPowerPct)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    return { rows, cycle: Math.min(s.cyclesPlayed + 1, total), total };
  }
  return { rows: live, cycle: 0, total: 0 };
}

/**
 * Whole-fund aggregate stats for the public pre-join page (no per-user data).
 * No live source yet (B7 swaps to an on-chain aggregate), so the seed serves
 * both mock and live modes — it never touches the data provider.
 */
export function useFundStats(): FundStats {
  return SEED_FUND_STATS;
}

// Demo-entry flag: the welcome page's "View demo" button sets this so a visitor
// can jump straight into the app in mock mode without a real deposit/auth. Backed
// by a module store (persisted) so it survives the provider remount when the mode
// flips. Only consulted in mock mode — live still requires a real position.
const DEMO_KEY = "concordia:demo-joined";
let demoEntered: boolean | null = null;
const demoListeners = new Set<() => void>();

function demoSnapshot(): boolean {
  if (demoEntered === null) demoEntered = window.localStorage.getItem(DEMO_KEY) === "1";
  return demoEntered;
}
function demoServerSnapshot(): boolean {
  return false;
}
function subscribeDemo(cb: () => void): () => void {
  demoListeners.add(cb);
  return () => {
    demoListeners.delete(cb);
  };
}
/** Mark the viewer as "in the demo" so the membership gate lets them into the app. */
export function enterDemo(): void {
  demoEntered = true;
  window.localStorage.setItem(DEMO_KEY, "1");
  demoListeners.forEach((l) => l());
}
function useDemoEntered(): boolean {
  return useSyncExternalStore(subscribeDemo, demoSnapshot, demoServerSnapshot);
}

/**
 * True once the viewer can see the full app. Live: holds a position (deposited via
 * /join). Mock: holds a position OR clicked "View demo". Drives the membership gate:
 * non-members see /welcome with no nav; members get the full app.
 */
export function useHasJoined(): boolean {
  const isMock = useIsMock();
  const demo = useDemoEntered();
  const hasPosition = usePosition().shares > 0;
  return hasPosition || (isMock && demo);
}

export interface FundActions {
  getDemoUSDC(): Promise<void>;
  deposit(amount: number): Promise<void>;
  castVote(allocs: Pick[]): Promise<void>;
  claim(): Promise<void>;
  /** Mock: resolve the cycle locally. Live: POST the keeper's advance route. */
  resolveCycle(): Promise<void>;
  /** Roll straight into a fresh OPEN cycle (clears the recorded vote + score). */
  startNewCycle(): Promise<void>;
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
    const w = await requireWallet();
    // The embedded wallet is a fresh EOA with no ETH. Sponsor gas before any write
    // (mint here, then approve + deposit) so the tx can't stall waiting on gas it
    // lacks; a failure surfaces here instead of hanging the spinner forever.
    if (address) {
      const res = await fetch("/api/fund-gas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user: address }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not sponsor gas for your wallet.");
      }
    }
    await scGetDemoUSDC(w, BigInt(10_000_000_000)); // 10,000 demo USDC
  }, [USE_MOCK, requireWallet, address]);

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

  const startNewCycle = useCallback(async () => {
    if (USE_MOCK) {
      ctx?.dispatch({ type: "NEW_CYCLE" });
      return;
    }
    await fetch("/api/advance", { method: "POST" }).catch(() => {});
  }, [USE_MOCK, ctx]);

  return {
    getDemoUSDC,
    deposit,
    castVote,
    claim,
    resolveCycle,
    startNewCycle,
    canClaim: USE_MOCK ? Boolean(ctx?.state.resolved) : rewardCredit > BigInt(0),
    claimed: USE_MOCK ? Boolean(ctx?.state.claimed) : claimedLive,
    lastVote: USE_MOCK ? ctx?.state.lastVote ?? null : lastVoteLive,
  };
}
