// ALWAYS-ON KEEPER — the live app's heartbeat (ROADMAP C, ISSUES #8/#12). Loops 5-min cycles
// forever: post prices → open → [voting window] → lock + re-peg → post next week → re-peg →
// resolve, stepping through real 2024 history on repeat. This is the hosting-fallback entrypoint
// (Railway, ISSUES #13) and runs the SAME core logic the CRE workflow does (cre/my-workflow).
//
// Drive: the ON-CHAIN state machine is the source of truth. Each pass reads Governance.state()
// and does the next action, so a restart resumes at the CORRECT phase. Caveat: timing is paced by
// the in-process sleeps, so a restart mid-phase advances that phase immediately (it doesn't wait
// out the remaining voting/hold window). Fine for the supervised demo; precise mid-cycle resume
// would need an on-chain "phase-started-at" timestamp (Governance doesn't expose one).
//
// Env: KEEPER_KEY (0x…, the onlyKeeper EOA) · MODE=replay|live (default replay) ·
//      POOL_ASSETS=AAPL,NVDA,… (pools to re-peg; default demo set) · RPC_URL (see @concordia/shared).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { formatEther, parseEther } from "viem";
import { addresses, UNIVERSE } from "@concordia/shared";
import { ViemChainAdapter } from "../src/chain/viemAdapter.ts";
import { ReplayFixtureSource, LiveAPISource, type PriceSource, type PriceSnapshot } from "../src/core/priceSource.ts";
import { computeResolve } from "../src/core/resolve.ts";
import { returnBetween, type ReplayFixture } from "../src/core/fixture.ts";
import { DEMO_TIMING } from "../src/core/cycle.ts";

const sleep = (sec: number) => new Promise((r) => setTimeout(r, sec * 1000));
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

// Re-peg the whole universe by default — the same 18 the deploy seeds + the fixture
// covers — so every votable asset's pool stays aligned with the oracle. Override with
// POOL_ASSETS only to trim for speed (see note in run() about per-cycle tx cost).
const DEFAULT_POOLS = [...UNIVERSE];

async function loadFixture(): Promise<ReplayFixture> {
  // node:fs (not Bun.file) so this runs under both Bun (local) and Node/tsx (the Railway image).
  const path = fileURLToPath(new URL("../fixtures/replay.json", import.meta.url));
  try {
    return JSON.parse(await readFile(path, "utf8")) as ReplayFixture;
  } catch {
    throw new Error("fixtures/replay.json missing — run `bun run build-fixture` first");
  }
}

// Auto-top-up: the keeper EOA pays gas every cycle, so keep it alive from the CDP faucet
// (0.0001 ETH/claim, 1000/day). Claims only when below MIN; bounded per event. Needs
// CDP_API_KEY_ID + CDP_API_KEY_SECRET + CDP_WALLET_SECRET — otherwise it just warns.
const TOPUP_MIN = parseEther("0.0005");
const MAX_CLAIMS_PER_TOPUP = 8;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cdpClient: any = null;

async function topUpIfLow(adapter: ViemChainAdapter, log: (m: string) => void): Promise<void> {
  let bal: bigint;
  try {
    bal = await adapter.getBalance();
  } catch {
    return; // a transient RPC error here must never stall the heartbeat
  }
  if (bal >= TOPUP_MIN) return;

  if (!(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET && process.env.CDP_WALLET_SECRET)) {
    log(`keeper balance low (${formatEther(bal)} ETH) — set CDP_API_KEY_ID/SECRET + CDP_WALLET_SECRET to auto-top-up`);
    return;
  }
  try {
    if (!cdpClient) {
      const { CdpClient } = await import("@coinbase/cdp-sdk");
      cdpClient = new CdpClient();
    }
    let claims = 0;
    while (bal < TOPUP_MIN && claims < MAX_CLAIMS_PER_TOPUP) {
      await cdpClient.evm.requestFaucet({ address: adapter.keeper, network: "base-sepolia", token: "eth" });
      claims++;
      // The faucet tx isn't ours, so just poll the balance until it reflects the claim.
      for (let i = 0; i < 6; i++) {
        await sleep(2);
        const b = await adapter.getBalance();
        if (b > bal) { bal = b; break; }
      }
    }
    log(`CDP faucet top-up: ${claims} claim(s) -> ${formatEther(bal)} ETH`);
  } catch (e) {
    log(`CDP top-up failed (non-fatal): ${(e as Error).message}`);
  }
}

/** Per-ticker + S&P fractional return between the lock snapshot and the resolve snapshot. */
function cycleReturns(lock: PriceSnapshot, resolve: PriceSnapshot) {
  const byTicker: Record<string, number> = {};
  for (const t of Object.keys(lock.pricesE8)) {
    if (resolve.pricesE8[t] !== undefined) byTicker[t] = returnBetween(lock.pricesE8[t], resolve.pricesE8[t]);
  }
  return { byTicker, sp: returnBetween(lock.spE8, resolve.spE8) };
}

async function main() {
  const key = process.env.KEEPER_KEY as `0x${string}` | undefined;
  if (!key) throw new Error("KEEPER_KEY not set (the onlyKeeper EOA private key)");
  if (addresses.governance === "0x0000000000000000000000000000000000000000")
    throw new Error("addresses.governance is unset — deploy contracts and fill shared/src/addresses.ts");

  const mode = (process.env.MODE ?? "replay") as "replay" | "live";
  const poolAssets = (process.env.POOL_ASSETS?.split(",").map((s) => s.trim()).filter(Boolean)) ?? DEFAULT_POOLS;
  const timing = DEMO_TIMING;

  const source: PriceSource = mode === "live" ? new LiveAPISource(UNIVERSE) : new ReplayFixtureSource(await loadFixture());
  const adapter = new ViemChainAdapter(key);
  log(`keeper ${adapter.keeper} | mode=${mode} | pools=[${poolAssets.join(",")}] | window=${timing.votingWindowSec}s hold=${timing.holdSec}s`);

  // Remember each cycle's lock-time prices so resolve scores against what the fund actually bought.
  const lockSnapshots = new Map<number, PriceSnapshot>();

  for (;;) {
    try {
      await topUpIfLow(adapter, log);
      const state = await adapter.getState();
      const cycleId = await adapter.getCycleId();

      if (state === "IDLE") {
        const snap = await source.snapshotForCycle(cycleId);
        log(`cycle ${cycleId} OPEN — posting prices: ${snap.label}`);
        await adapter.setPrices(snap);
        await adapter.repegPools(poolAssets, snap);
        lockSnapshots.set(cycleId, snap);
        await adapter.openCycle();
        log(`cycle ${cycleId} voting open for ${timing.votingWindowSec}s`);
        await sleep(timing.votingWindowSec);
      } else if (state === "OPEN") {
        log(`cycle ${cycleId} LOCK — selecting basket + executing swaps`);
        await adapter.lockCycle();
        await adapter.repegPools(poolAssets, lockSnapshots.get(cycleId) ?? (await source.snapshotForCycle(cycleId)));
        log(`cycle ${cycleId} holding for ${timing.holdSec}s`);
        await sleep(timing.holdSec);
      } else {
        // LOCKED → resolve: advance one market week, then score + pay out.
        // Recover the lock-time prices BEFORE overwriting the oracle with next week's. In replay
        // they're deterministic from cycleId; in live (post-restart) read them off the oracle,
        // which still holds them at this point — using current Yahoo prices here would zero out
        // the cycle's returns and mis-score everyone.
        const lock =
          lockSnapshots.get(cycleId) ??
          (mode === "replay" ? await source.snapshotForCycle(cycleId) : await adapter.readOracleSnapshot(UNIVERSE));

        const next = await source.snapshotForCycle(cycleId + 1);
        log(`cycle ${cycleId} RESOLVE — advancing to: ${next.label}`);
        await adapter.setPrices(next);
        await adapter.repegPools(poolAssets, next);

        const { byTicker, sp } = cycleReturns(lock, next);
        const reads = await adapter.readResolveInputs();
        const out = computeResolve({ ...reads, returnByTicker: byTicker, spReturn: sp });
        log(`cycle ${cycleId} resolving ${out.members.length} voters (S&P ${(sp * 100).toFixed(1)}%)`);
        await adapter.resolveCycle(out);
        lockSnapshots.delete(cycleId);
        log(`cycle ${cycleId} resolved → IDLE`);
      }
    } catch (e) {
      log(`error: ${(e as Error).message} — retrying in 15s`);
      await sleep(15);
    }
  }
}

main().catch((e) => {
  log(`fatal: ${(e as Error).message}`);
  process.exit(1);
});
