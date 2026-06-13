// One-shot demo seeder — makes a cycle NON-empty so you can watch NAV + the leaderboard move.
// Run it in a second terminal alongside the heartbeat (scripts/run.ts); it uses the SAME key + RPC.
// It: (1) verifies you, (2) deposits demo USDC if you hold no shares, then (3) polls until a cycle is
// OPEN *and* you have voting power (power is snapshotted at openCycle, so a fresh deposit only counts
// from the next cycle), and casts a vote. After that you keep your shares, so you can re-run it any
// cycle to vote again. Idempotent: skips verify/deposit if already done, treats AlreadyVoted as done.
//
// Env: KEEPER_KEY (same onlyKeeper/admin EOA as the heartbeat) · RPC_URL · DEPOSIT_USDC (whole USDC,
//      default 5000) · VOTE_TICKER (default AAPL).
//   cd keeper
//   KEEPER_KEY=$PK RPC_URL="https://…/base-sepolia/…" bun run scripts/seed-demo.ts
import { publicClient as makePublicClient, walletClientFromKey, addresses, tickerToBytes32 } from "@concordia/shared";
import { parseAbi } from "viem";

const VAULT_ABI = parseAbi([
  "function verify(address user, bytes proof)",
  "function deposit(uint256 assets) returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function verified(address) view returns (bool)",
  "function totalAssets() view returns (uint256)",
]);
const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function mint(address to, uint256 amount)",
]);
const GOV_ABI = parseAbi([
  "struct Alloc { bytes32 asset; uint16 weightBps; }",
  "function state() view returns (uint8)",
  "function cycleId() view returns (uint256)",
  "function votingPower(address) view returns (uint256)",
  "function castVote(Alloc[] allocations)",
]);

const STATE = ["IDLE", "OPEN", "LOCKED"] as const;
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

async function main() {
  const key = process.env.KEEPER_KEY as `0x${string}` | undefined;
  if (!key) throw new Error("KEEPER_KEY not set (the admin/keeper EOA private key)");

  const depositUsdc = BigInt(process.env.DEPOSIT_USDC ?? "5000") * 1_000_000n; // 6dp
  const ticker = process.env.VOTE_TICKER ?? "AAPL";

  const pub = makePublicClient();
  const wallet = walletClientFromKey(key);
  const me = wallet.account!.address;
  log(`member ${me} | deposit ${depositUsdc / 1_000_000n} USDC | vote 100% ${ticker}`);

  const read = (address: `0x${string}`, abi: any, functionName: string, args: any[] = []) =>
    pub.readContract({ address, abi, functionName, args }) as Promise<any>;

  async function send(label: string, address: `0x${string}`, abi: any, fn: string, args: any[]) {
    for (let attempt = 1; ; attempt++) {
      try {
        const hash = await wallet.writeContract({ address, abi, functionName: fn, args, account: wallet.account!, chain: wallet.chain });
        const rcpt = await pub.waitForTransactionReceipt({ hash });
        if (rcpt.status !== "success") throw new Error(`reverted (tx ${hash})`);
        log(`  ✓ ${label} (${hash})`);
        return;
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("AlreadyVoted")) { log(`  • ${label}: already voted this cycle`); return; }
        if (attempt >= 3) throw e;
        log(`  … ${label} failed (${msg.split("\n")[0]}) — retry ${attempt}/3 in 6s`); // usually a nonce race with the keeper
        await sleep(6);
      }
    }
  }

  // 1. verify (admin = me)
  if (!(await read(addresses.vault, VAULT_ABI, "verified", [me]))) {
    await send("verify", addresses.vault, VAULT_ABI, "verify", [me, "0x"]);
  } else log("  • already verified");

  // 2. deposit if no shares yet (top up USDC via the public mint if short)
  const shares = (await read(addresses.vault, VAULT_ABI, "balanceOf", [me])) as bigint;
  if (shares === 0n) {
    const bal = (await read(addresses.usdc, ERC20_ABI, "balanceOf", [me])) as bigint;
    if (bal < depositUsdc) await send("mint demo USDC", addresses.usdc, ERC20_ABI, "mint", [me, depositUsdc]);
    while (STATE[Number(await read(addresses.governance, GOV_ABI, "state"))] === "LOCKED") {
      log("  … cycle LOCKED, can't deposit — waiting 10s"); await sleep(10);
    }
    await send("approve", addresses.usdc, ERC20_ABI, "approve", [addresses.vault, depositUsdc]);
    await send("deposit", addresses.vault, VAULT_ABI, "deposit", [depositUsdc]);
  } else log(`  • already holds ${shares} shares`);

  // 3. wait for an OPEN cycle where I have power, then vote
  log("waiting for an OPEN cycle where I have voting power (deposits count from the NEXT openCycle)…");
  for (;;) {
    const state = STATE[Number(await read(addresses.governance, GOV_ABI, "state"))];
    const cycle = (await read(addresses.governance, GOV_ABI, "cycleId")) as bigint;
    const power = (await read(addresses.governance, GOV_ABI, "votingPower", [me])) as bigint;
    if (state === "OPEN" && power > 0n) {
      log(`cycle ${cycle} OPEN, my power=${power} bps — voting 100% ${ticker}`);
      await send(`castVote ${ticker}`, addresses.governance, GOV_ABI, "castVote", [[{ asset: tickerToBytes32(ticker), weightBps: 10000 }]]);
      break;
    }
    log(`  … state=${state} cycle=${cycle} myPower=${power}bps — checking again in 8s`);
    await sleep(8);
  }

  log("done — watch the heartbeat log for 'resolving 1 voters'; the basket buys " + ticker + " and NAV moves.");
  process.exit(0);
}

main().catch((e) => { log(`fatal: ${(e as Error).message}`); process.exit(1); });
