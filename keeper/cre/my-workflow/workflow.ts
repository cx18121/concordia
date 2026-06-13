// Chainlink CRE workflow — the off-chain brain on a DON (CONTRACTS.md §6). A cron-triggered
// handler that advances the on-chain cycle one step per "tick": read Governance.state() → do the
// next job.
//   IDLE   → post prices (Oracle) + openCycle (Governance)
//   OPEN   → lockCycle (Governance)
//   LOCKED → post next week's prices + resolveCycle (per-member EWMA accuracy + reward credit)
//
// The HTTP trigger path is avoided for simulation because http-trigger@1.0.0-alpha currently traps
// at subscribe in this CLI/SDK combination. Cron simulation is one-shot, but it exercises the same
// on-chain tick path with `--broadcast`.
//
// Writes go through Chainlink's KeystoneForwarder → receiver.onReport (see src/core/encode.ts for
// the wire format). Reads use the EVM capability. The SAME pure core (resolve/scoring/fixture)
// drives the Bun heartbeat in scripts/run.ts — this file is just the CRE I/O shell around it.
//
// Run: `cre workflow simulate my-workflow --target staging-settings --broadcast`.
// Default mode is `replay` — deterministic real-2024 history from the bundled fixture.
import {
  bytesToHex,
  ConsensusAggregationByFields,
  cre,
  encodeCallMsg,
  getNetwork,
  type HTTPSendRequester,
  LAST_FINALIZED_BLOCK_NUMBER,
  median,
  prepareReportRequest,
  text,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  parseAbiParameters,
  stringToHex,
  zeroAddress,
  type Abi,
  type Address,
} from "viem";
import { z } from "zod";
import { governanceKeeperAbi } from "../../src/chain/abi.ts";
import replayFixtureJson from "../../fixtures/replay.json";

const fixture = replayFixtureJson as ReplayFixture;

// Keep CRE pure: do not import @concordia/shared's barrel here. It re-exports Node/browser modules
// with module-scope process.env/fetch, which QuickJS evaluates before subscription.
interface FixtureWeek {
  date: string;
  prices: Record<string, number>;
  sp: number;
}
interface ReplayFixture {
  tickers: string[];
  weeks: FixtureWeek[];
}
interface ResolveInput {
  voters: string[];
  allocsByVoter: Record<string, { asset: string; weightBps: number }[]>;
  oldAccE4ByVoter: Record<string, number>;
  returnByTicker: Record<string, number>;
  spReturn: number;
}
interface ResolveOutput {
  members: string[];
  newAccuracyE4: number[];
  creditWeightBps: number[];
}

const CYCLE_STATE = ["IDLE", "OPEN", "LOCKED"] as const;
const EWMA_ALPHA_BPS = 2500;
const UNIVERSE = [
  "AAPL",
  "MSFT",
  "NVDA",
  "GOOGL",
  "AMZN",
  "META",
  "TSLA",
  "JPM",
  "XOM",
  "UNH",
  "WMT",
  "SPY",
  "QQQ",
  "XLK",
  "XLF",
  "XLE",
  "XLV",
  "ARKK",
] as const;

const KeeperAction = { OPEN: 0, LOCK: 1, RESOLVE: 2 } as const;

const yahooSymbol = (t: string): string => (t === "SP500" || t === "^GSPC" ? "%5EGSPC" : t);
const tickerToBytes32 = (ticker: string): `0x${string}` => stringToHex(ticker, { size: 32 });
const toE8 = (price: number): bigint => BigInt(Math.round(price * 1e8));
const returnBetween = (fromE8: bigint, toE8_: bigint): number => (fromE8 === 0n ? 0 : Number(toE8_) / Number(fromE8) - 1);
const weekOf = (cycleId: number, weekCount: number): number => (weekCount === 0 ? 0 : ((cycleId % weekCount) + weekCount) % weekCount);

function weekToE8(week: FixtureWeek): { pricesE8: Record<string, bigint>; spE8: bigint } {
  const pricesE8: Record<string, bigint> = {};
  for (const [t, p] of Object.entries(week.prices)) pricesE8[t] = toE8(p);
  return { pricesE8, spE8: toE8(week.sp) };
}

const TICKER_BY_BYTES32 = new Map<string, string>(UNIVERSE.map((t) => [tickerToBytes32(t).toLowerCase(), t]));

function bytes32ToTicker(b: `0x${string}`): string {
  const known = TICKER_BY_BYTES32.get(b.toLowerCase());
  if (known) return known;
  const hex = b.slice(2).replace(/(00)+$/, "");
  let out = "";
  for (let i = 0; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function decodeAllocs(allocs: readonly { asset: `0x${string}`; weightBps: number | bigint }[]): { asset: string; weightBps: number }[] {
  return allocs.map((a) => ({ asset: bytes32ToTicker(a.asset), weightBps: Number(a.weightBps) }));
}

function voteWeightedExcess(backed: { asset: string; weightBps: number }[], assetReturn: Record<string, number>, sp: number): number {
  let x = 0;
  for (const b of backed) x += (b.weightBps / 1e4) * ((assetReturn[b.asset] ?? 0) - sp);
  return x;
}

function creditWeights(excessByMember: Record<string, number>): Record<string, number> {
  let total = 0;
  const pos: Record<string, number> = {};
  for (const [m, x] of Object.entries(excessByMember)) {
    const p = Math.max(x, 0);
    pos[m] = p;
    total += p;
  }
  const out: Record<string, number> = {};
  for (const [m, p] of Object.entries(pos)) out[m] = total > 0 ? Math.round((p / total) * 1e4) : 0;
  return out;
}

function computeResolve(input: ResolveInput): ResolveOutput {
  const { voters, allocsByVoter, oldAccE4ByVoter, returnByTicker, spReturn } = input;
  const cycleExcess: Record<string, number> = {};
  for (const m of voters) cycleExcess[m] = voteWeightedExcess(allocsByVoter[m] ?? [], returnByTicker, spReturn);

  const credit = creditWeights(cycleExcess);
  const newAccuracyE4: number[] = [];
  const creditWeightBps: number[] = [];
  for (const m of voters) {
    const oldFrac = (oldAccE4ByVoter[m] ?? 0) / 1e4;
    const a = EWMA_ALPHA_BPS / 1e4;
    newAccuracyE4.push(Math.round((a * cycleExcess[m] + (1 - a) * oldFrac) * 1e4));
    creditWeightBps.push(credit[m] ?? 0);
  }

  return { members: [...voters], newAccuracyE4, creditWeightBps };
}

function encodePricesReport(pricesE8: Record<string, bigint>, spE8: bigint): `0x${string}` {
  const tickers = Object.keys(pricesE8);
  return encodeAbiParameters(parseAbiParameters("bytes32[], uint256[], uint256"), [
    tickers.map((t) => tickerToBytes32(t)),
    tickers.map((t) => pricesE8[t]),
    spE8,
  ]);
}

function encodeLifecycleReport(action: typeof KeeperAction.OPEN | typeof KeeperAction.LOCK): `0x${string}` {
  return encodeAbiParameters(parseAbiParameters("uint8, bytes"), [action, "0x"]);
}

function encodeRepegReport(ticker: string, targetE8: bigint): `0x${string}` {
  return encodeAbiParameters(parseAbiParameters("bytes32, uint256"), [tickerToBytes32(ticker), targetE8]);
}

function encodeResolveReport(out: ResolveOutput): `0x${string}` {
  const data = encodeAbiParameters(parseAbiParameters("address[], int256[], uint256[]"), [
    out.members as `0x${string}`[],
    out.newAccuracyE4.map((n) => BigInt(n)),
    out.creditWeightBps.map((n) => BigInt(n)),
  ]);
  return encodeAbiParameters(parseAbiParameters("uint8, bytes"), [KeeperAction.RESOLVE, data]);
}

// ─── Config ─────────────────────────────────────────────────
export const configSchema = z.object({
  mode: z.enum(["replay", "live"]).default("replay"),
  poolAssets: z.array(z.string()).default([]), // pools to re-peg toward the posted oracle price
  evms: z.array(
    z.object({
      chainSelectorName: z.string(),
      oracle: z.string(), //       PriceOracle receiver
      governance: z.string(), //   Governance receiver
      executor: z.string(), //     UniswapExecutor (re-peg)
      gasLimit: z.string(),
    }),
  ),
});
type Config = z.infer<typeof configSchema>;
type EvmCfg = Config["evms"][number];

// ─── EVM I/O helpers ────────────────────────────────────────
const evmClientFor = (evm: EvmCfg) => {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: evm.chainSelectorName, isTestnet: true });
  if (!network) throw new Error(`network not found: ${evm.chainSelectorName}`);
  return new cre.capabilities.EVMClient(network.chainSelector.selector);
};

function read<T>(runtime: Runtime<Config>, client: any, address: string, abi: Abi, functionName: string, args: any[] = []): T {
  const callData = encodeFunctionData({ abi, functionName, args });
  const result = client
    .callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to: address as Address, data: callData }), blockNumber: LAST_FINALIZED_BLOCK_NUMBER })
    .result();
  return decodeFunctionResult({ abi, functionName, data: bytesToHex(result.data) }) as T;
}

function writeReport(runtime: Runtime<Config>, client: any, receiver: string, payload: `0x${string}`, gasLimit: string, label: string): string {
  const report = runtime.report(prepareReportRequest(payload)).result();
  const res = client.writeReport(runtime, { receiver: receiver as Address, report, gasConfig: { gasLimit } }).result();
  if (res.txStatus !== TxStatus.SUCCESS) throw new Error(`${label} write failed: ${res.errorMessage || res.txStatus}`);
  if (res.receiverContractExecutionStatus !== undefined && res.receiverContractExecutionStatus !== 0)
    throw new Error(`${label} receiver onReport failed: status ${res.receiverContractExecutionStatus}`);
  return bytesToHex(res.txHash || new Uint8Array(32));
}

// ─── Prices: replay (bundled fixture) | live (HTTP capability) ──
interface Snapshot { pricesE8: Record<string, bigint>; spE8: bigint; label: string }

function replaySnapshot(cycleId: number): Snapshot {
  const w = weekOf(cycleId, fixture.weeks.length);
  const week = fixture.weeks[w];
  const { pricesE8, spE8 } = weekToE8(week);
  return { pricesE8, spE8, label: `replay week ${week.date} (${w + 1}/${fixture.weeks.length})` };
}

const YF = "https://query1.finance.yahoo.com/v8/finance/chart";
/** One ticker's live price via the HTTP capability (DON-aggregated by median). */
function livePrice(runtime: Runtime<Config>, http: any, ticker: string): number {
  const fetchOne = (requester: HTTPSendRequester): { price: number } => {
    const resp = requester.sendRequest({ method: "GET", url: `${YF}/${yahooSymbol(ticker)}` }).result();
    if (resp.statusCode !== 200) throw new Error(`Yahoo ${ticker} HTTP ${resp.statusCode}`);
    const json = JSON.parse(text(resp));
    return { price: json.chart.result[0].meta.regularMarketPrice as number };
  };
  return http.sendRequest(runtime, fetchOne, ConsensusAggregationByFields<{ price: number }>({ price: median }))().result().price;
}

function liveSnapshot(runtime: Runtime<Config>): Snapshot {
  const http = new cre.capabilities.HTTPClient();
  const pricesE8: Record<string, bigint> = {};
  for (const t of fixture.tickers) pricesE8[t] = toE8(livePrice(runtime, http, t));
  return { pricesE8, spE8: toE8(livePrice(runtime, http, "SP500")), label: "live (Yahoo)" };
}

// ─── Resolve inputs (on-chain votes) ────────────────────────
function readResolveInputs(runtime: Runtime<Config>, client: any, governance: string) {
  const voters = read<readonly Address[]>(runtime, client, governance, governanceKeeperAbi, "getVoters");
  const allocsByVoter: Record<string, { asset: string; weightBps: number }[]> = {};
  const oldAccE4ByVoter: Record<string, number> = {};
  for (const m of voters) {
    const allocs = read<readonly { asset: `0x${string}`; weightBps: number }[]>(runtime, client, governance, governanceKeeperAbi, "allocOf", [m]);
    const acc = read<bigint>(runtime, client, governance, governanceKeeperAbi, "accuracyOf", [m]);
    allocsByVoter[m] = decodeAllocs(allocs);
    oldAccE4ByVoter[m] = Number(acc);
  }
  return { voters: [...voters] as string[], allocsByVoter, oldAccE4ByVoter };
}

function cycleReturns(lock: Snapshot, next: Snapshot) {
  const byTicker: Record<string, number> = {};
  for (const t of Object.keys(lock.pricesE8)) if (next.pricesE8[t] !== undefined) byTicker[t] = returnBetween(lock.pricesE8[t], next.pricesE8[t]);
  return { byTicker, sp: returnBetween(lock.spE8, next.spE8) };
}

// ─── Tick handler: advance the cycle one step ───────────────
// Fired by the cron trigger (the "tick"). The payload is ignored — the on-chain Governance.state()
// is the source of truth, so each tick safely advances exactly one step.
export const onTick = (runtime: Runtime<Config>, _payload?: unknown): string => {
  const cfg = runtime.config;
  const evm = cfg.evms[0];
  const client = evmClientFor(evm);

  const state = CYCLE_STATE[Number(read<bigint>(runtime, client, evm.governance, governanceKeeperAbi, "state"))];
  const cycleId = Number(read<bigint>(runtime, client, evm.governance, governanceKeeperAbi, "cycleId"));
  runtime.log(`tick: state=${state} cycle=${cycleId} mode=${cfg.mode}`);

  if (state === "IDLE") {
    const snap = cfg.mode === "live" ? liveSnapshot(runtime) : replaySnapshot(cycleId);
    runtime.log(`posting prices: ${snap.label}`);
    const priceTx = writeReport(runtime, client, evm.oracle, encodePricesReport(snap.pricesE8, snap.spE8), evm.gasLimit, "setPrices");
    repegPools(runtime, client, evm, cfg.poolAssets, snap);
    const openTx = writeReport(runtime, client, evm.governance, encodeLifecycleReport(KeeperAction.OPEN), evm.gasLimit, "openCycle");
    return `opened cycle ${cycleId} (${snap.label}) prices=${priceTx} open=${openTx}`;
  }

  if (state === "OPEN") {
    const lockTx = writeReport(runtime, client, evm.governance, encodeLifecycleReport(KeeperAction.LOCK), evm.gasLimit, "lockCycle");
    repegPools(runtime, client, evm, cfg.poolAssets, replaySnapshot(cycleId));
    return `locked cycle ${cycleId} lock=${lockTx}`;
  }

  // LOCKED → resolve. Replay scoring is deterministic from cycleId (lock week vs next week).
  if (cfg.mode === "live")
    throw new Error("live-mode resolve runs in the Bun heartbeat (scripts/run.ts, which snapshots lock prices); the CRE workflow resolves in replay mode");
  const lock = replaySnapshot(cycleId);
  const next = replaySnapshot(cycleId + 1);
  runtime.log(`advancing to ${next.label}`);
  writeReport(runtime, client, evm.oracle, encodePricesReport(next.pricesE8, next.spE8), evm.gasLimit, "setPrices");
  repegPools(runtime, client, evm, cfg.poolAssets, next);

  const { byTicker, sp } = cycleReturns(lock, next);
  const reads = readResolveInputs(runtime, client, evm.governance);
  const out = computeResolve({ ...reads, returnByTicker: byTicker, spReturn: sp });
  const resolveTx = writeReport(runtime, client, evm.governance, encodeResolveReport(out), evm.gasLimit, "resolveCycle");
  return `resolved cycle ${cycleId} voters=${out.members.length} sp=${(sp * 100).toFixed(1)}% resolve=${resolveTx}`;
};

/** Re-peg each configured pool toward the price we just posted (CRE plays the arbitrageur). */
function repegPools(runtime: Runtime<Config>, client: any, evm: EvmCfg, poolAssets: string[], snap: Snapshot): void {
  for (const t of poolAssets) {
    const target = snap.pricesE8[t];
    if (target === undefined) continue;
    writeReport(runtime, client, evm.executor, encodeRepegReport(t, target), evm.gasLimit, `repeg ${t}`);
  }
}

// ─── Workflow init ──────────────────────────────────────────
// Cron trigger (capability cron-trigger@1.0.0, STABLE). The HTTP trigger (http-trigger@1.0.0-alpha)
// traps at `subscribe` under `cre workflow simulate --listen` on CLI 1.20 / sdk 1.11 (beta path).
// Each fire = one tick = advance the on-chain state machine one step. `cre workflow simulate
// --broadcast` runs it one-shot → one real on-chain write via the KeystoneForwarder (the
// Chainlink-prize evidence: CRE causing an on-chain state change). The Bun heartbeat
// (scripts/run.ts) remains the continuous always-on driver for the live demo.
export function initWorkflow(_config: Config) {
  const cron = new cre.capabilities.CronCapability();
  return [cre.handler(cron.trigger({ schedule: "*/30 * * * * *" }), onTick)];
}
