// Chainlink CRE workflow — the off-chain brain on a DON (CONTRACTS.md §6). An HTTP-triggered
// handler that advances the on-chain cycle one step per "tick": read Governance.state() → do the
// next job.
//   IDLE   → post prices (Oracle) + openCycle (Governance)
//   OPEN   → lockCycle (Governance)
//   LOCKED → post next week's prices + resolveCycle (per-member EWMA accuracy + reward credit)
//
// Why an HTTP trigger (not cron): `cre workflow simulate --listen` keeps the simulator alive and
// runs the workflow on each request to http://localhost:2000/trigger — so a trivial external "tick"
// (a curl loop for always-on, or a button on stage) drives a continuous, real-on-chain demo with
// NO deployment (`--broadcast` writes real testnet txs via the mock forwarder). Confirmed by the
// CRE organizers + docs; needs CRE CLI ≥ v1.19. Cron-in-simulate is one-shot, which is why we don't
// use it here. For a DON-hosted deploy you'd add `cron.trigger({schedule})` → the same handler.
//
// Writes go through Chainlink's KeystoneForwarder → receiver.onReport (see src/core/encode.ts for
// the wire format). Reads use the EVM capability. The SAME pure core (resolve/scoring/fixture)
// drives the Bun heartbeat in scripts/run.ts — this file is just the CRE I/O shell around it.
//
// Run: `cre workflow simulate my-workflow --target staging-settings --listen --broadcast`.
// Default mode is `replay` — deterministic real-2024 history from the bundled fixture.
import {
  bytesToHex,
  ConsensusAggregationByFields,
  cre,
  encodeCallMsg,
  getNetwork,
  type HTTPPayload,
  type HTTPSendRequester,
  LAST_FINALIZED_BLOCK_NUMBER,
  median,
  prepareReportRequest,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import { decodeFunctionResult, encodeFunctionData, zeroAddress, type Abi, type Address } from "viem";
import { z } from "zod";
import { yahooSymbol } from "@chf/shared";
import { governanceKeeperAbi } from "../../src/chain/abi.ts";
import { computeResolve } from "../../src/core/resolve.ts";
import { weekOf, weekToE8, returnBetween, toE8, type ReplayFixture } from "../../src/core/fixture.ts";
import { decodeAllocs, CYCLE_STATE } from "../../src/core/cycle.ts";
import {
  encodePricesReport,
  encodeLifecycleReport,
  encodeResolveReport,
  encodeRepegReport,
  KeeperAction,
} from "../../src/core/encode.ts";
import replayFixtureJson from "../../fixtures/replay.json";

const fixture = replayFixtureJson as ReplayFixture;

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
    const json = JSON.parse(Buffer.from(resp.body).toString("utf-8"));
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
// Triggered by an HTTP request (the external "tick"). The body is ignored — the on-chain
// Governance.state() is the source of truth, so each tick safely advances exactly one step.
export const onTick = (runtime: Runtime<Config>, _payload?: HTTPPayload): string => {
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
// HTTP trigger so `simulate --listen` runs the workflow on each request (no deploy needed).
// `trigger({})` = no authorized-key restriction, fine for local sim + the testnet demo.
export function initWorkflow(_config: Config) {
  const http = new cre.capabilities.HTTPCapability();
  return [cre.handler(http.trigger({}), onTick)];
}
