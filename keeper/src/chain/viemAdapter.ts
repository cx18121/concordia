// viem-backed chain adapter for the always-on Bun heartbeat (scripts/run.ts) and the hosting
// fallback (ISSUES #13 → Railway). Calls the frozen onlyKeeper functions DIRECTLY with a keeper EOA
// — no report/forwarder plumbing. (The CRE workflow writes the same actions via DON report instead;
// see cre/my-workflow.) All MONEY math stays on-chain — this only posts prices + scores + lifecycle.
import {
  publicClient as makePublicClient,
  walletClientFromKey,
  addresses,
  tickerToBytes32,
  type Alloc,
} from "@chf/shared";
import { oracleKeeperAbi, governanceKeeperAbi, executorKeeperAbi } from "./abi.js";
import { CYCLE_STATE, decodeAllocs, type CycleState } from "../core/cycle.js";
import type { PriceSnapshot } from "../core/priceSource.js";
import type { ResolveInput, ResolveOutput } from "../core/resolve.js";

export interface ResolveReads {
  voters: ResolveInput["voters"];
  allocsByVoter: ResolveInput["allocsByVoter"];
  oldAccE4ByVoter: ResolveInput["oldAccE4ByVoter"];
}

export class ViemChainAdapter {
  // Inferred from the @chf/shared factories so we stay on one viem copy (avoids dual-install type clash).
  private readonly pub: ReturnType<typeof makePublicClient>;
  private readonly wallet: ReturnType<typeof walletClientFromKey>;
  readonly keeper: `0x${string}`;

  constructor(keeperKey: `0x${string}`) {
    this.pub = makePublicClient();
    this.wallet = walletClientFromKey(keeperKey);
    this.keeper = this.wallet.account!.address;
  }

  // ---- reads ----

  async getState(): Promise<CycleState> {
    const s = (await this.pub.readContract({
      address: addresses.governance, abi: governanceKeeperAbi, functionName: "state",
    })) as number;
    return CYCLE_STATE[Number(s)];
  }

  async getCycleId(): Promise<number> {
    const id = (await this.pub.readContract({
      address: addresses.governance, abi: governanceKeeperAbi, functionName: "cycleId",
    })) as bigint;
    return Number(id);
  }

  /** Read the currently-posted oracle prices for `tickers` + benchmark as a snapshot.
   *  Used to recover live-mode lock prices after a restart: when the cycle is LOCKED the oracle
   *  still holds the lock-time prices — read them BEFORE overwriting with the resolve prices. */
  async readOracleSnapshot(tickers: readonly string[]): Promise<PriceSnapshot> {
    const pricesE8: Record<string, bigint> = {};
    const [entries, spE8] = await Promise.all([
      Promise.all(
        tickers.map(async (t) => [t, (await this.pub.readContract({
          address: addresses.oracle, abi: oracleKeeperAbi, functionName: "price", args: [tickerToBytes32(t)],
        })) as bigint] as const),
      ),
      this.pub.readContract({ address: addresses.oracle, abi: oracleKeeperAbi, functionName: "benchmark" }) as Promise<bigint>,
    ]);
    for (const [t, p] of entries) if (p > 0n) pricesE8[t] = p; // skip assets the oracle hasn't set
    return { pricesE8, spE8, label: "oracle (recovered lock prices)" };
  }

  /** Read the full voter set + their allocations + prior accuracy — resolve's on-chain inputs. */
  async readResolveInputs(): Promise<ResolveReads> {
    const voters = (await this.pub.readContract({
      address: addresses.governance, abi: governanceKeeperAbi, functionName: "getVoters",
    })) as `0x${string}`[];

    const allocsByVoter: ResolveReads["allocsByVoter"] = {};
    const oldAccE4ByVoter: ResolveReads["oldAccE4ByVoter"] = {};
    await Promise.all(
      voters.map(async (m) => {
        const [allocs, acc] = await Promise.all([
          this.pub.readContract({ address: addresses.governance, abi: governanceKeeperAbi, functionName: "allocOf", args: [m] }) as Promise<readonly Alloc[]>,
          this.pub.readContract({ address: addresses.governance, abi: governanceKeeperAbi, functionName: "accuracyOf", args: [m] }) as Promise<bigint>,
        ]);
        allocsByVoter[m] = decodeAllocs(allocs);
        oldAccE4ByVoter[m] = Number(acc);
      }),
    );
    return { voters: [...voters], allocsByVoter, oldAccE4ByVoter };
  }

  // ---- writes (await receipt, throw on revert) ----

  async setPrices(snap: PriceSnapshot): Promise<void> {
    const tickers = Object.keys(snap.pricesE8);
    const assets = tickers.map((t) => tickerToBytes32(t));
    const prices = tickers.map((t) => snap.pricesE8[t]);
    await this.send("oracle.setPrices", addresses.oracle, oracleKeeperAbi, "setPrices", [assets, prices, snap.spE8]);
  }

  async openCycle(): Promise<void> {
    await this.send("openCycle", addresses.governance, governanceKeeperAbi, "openCycle", []);
  }

  async lockCycle(): Promise<void> {
    await this.send("lockCycle", addresses.governance, governanceKeeperAbi, "lockCycle", []);
  }

  /** Re-peg every pool toward the oracle price we just posted (CRE plays the arbitrageur). */
  async repegPools(poolAssets: readonly string[], snap: PriceSnapshot): Promise<void> {
    for (const t of poolAssets) {
      const target = snap.pricesE8[t];
      if (target === undefined) continue;
      await this.send(`repeg ${t}`, addresses.executor, executorKeeperAbi, "repeg", [tickerToBytes32(t), target]);
    }
  }

  async resolveCycle(out: ResolveOutput): Promise<void> {
    await this.send(
      "resolveCycle", addresses.governance, governanceKeeperAbi, "resolveCycle",
      [out.members, out.newAccuracyE4.map(BigInt), out.creditWeightBps.map(BigInt)],
    );
  }

  private async send(label: string, address: `0x${string}`, abi: any, fn: string, args: any[]): Promise<void> {
    const hash = await this.wallet.writeContract({
      address, abi, functionName: fn, args, account: this.wallet.account!, chain: this.wallet.chain,
    });
    const rcpt = await this.pub.waitForTransactionReceipt({ hash });
    if (rcpt.status !== "success") throw new Error(`${label} reverted (tx ${hash})`);
  }
}
