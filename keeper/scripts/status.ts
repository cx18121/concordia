// Read-only fund dashboard — prints the live state of the fund on Base Sepolia: cycle/phase, NAV,
// reward pool, and a leaderboard of members (shares, accuracy, cycles, claimable rewards). No key
// needed; pure reads. Handy for verifying cycles and as a poor-man's leaderboard before the frontend.
//   cd keeper && bun run scripts/status.ts            (RPC_URL from .env, or defaults to public node)
import { publicClient as makePublicClient, addresses } from "@concordia/shared";
import { parseAbi, formatUnits } from "viem";

const GOV_ABI = parseAbi([
  "function state() view returns (uint8)",
  "function cycleId() view returns (uint256)",
  "function memberCount() view returns (uint256)",
  "function members(uint256) view returns (address)",
  "function accuracyOf(address) view returns (int256)",
  "function cyclesParticipated(address) view returns (uint256)",
  "function votingPower(address) view returns (uint256)",
  "function getVoters() view returns (address[])",
]);
const VAULT_ABI = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function rewardPool() view returns (uint256)",
  "function navAtLock() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function rewardCredit(address) view returns (uint256)",
]);

const STATE = ["IDLE", "OPEN", "LOCKED"];
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usdc = (v: bigint) => `$${Number(formatUnits(v, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pct = (e4: bigint) => `${(Number(e4) / 100).toFixed(2)}%`; // E4 → %

async function main() {
  const pub = makePublicClient();
  const gov = (fn: string, args: any[] = []) => pub.readContract({ address: addresses.governance, abi: GOV_ABI, functionName: fn as any, args: args as any }) as Promise<any>;
  const vault = (fn: string, args: any[] = []) => pub.readContract({ address: addresses.vault, abi: VAULT_ABI, functionName: fn as any, args: args as any }) as Promise<any>;

  const [state, cycle, nav, supply, pool, navAtLock, count, voters] = await Promise.all([
    gov("state"), gov("cycleId"), vault("totalAssets"), vault("totalSupply"), vault("rewardPool"),
    vault("navAtLock"), gov("memberCount"), gov("getVoters"),
  ]);

  console.log(`\n  Concordia — Base Sepolia`);
  console.log(`  cycle ${cycle}  ·  ${STATE[Number(state)]}  ·  ${Number(count)} member(s)  ·  ${voters.length} voted this cycle`);
  console.log(`  NAV ${usdc(nav)}   shares ${formatUnits(supply, 6)}   reward pool ${usdc(pool)}   navAtLock ${usdc(navAtLock)}\n`);

  const voterSet = new Set(voters.map((v: string) => v.toLowerCase()));
  const rows: { addr: string; shares: bigint; acc: bigint; cycles: bigint; credit: bigint; power: bigint }[] = [];
  for (let i = 0n; i < count; i++) {
    const addr = (await gov("members", [i])) as string;
    const [shares, acc, cycles, credit, power] = await Promise.all([
      vault("balanceOf", [addr]), gov("accuracyOf", [addr]), gov("cyclesParticipated", [addr]),
      vault("rewardCredit", [addr]), gov("votingPower", [addr]),
    ]);
    rows.push({ addr, shares, acc, cycles, credit, power });
  }
  rows.sort((a, b) => Number(b.acc - a.acc) || Number(b.shares - a.shares)); // leaderboard: accuracy, then capital

  console.log(`  #  member        shares      accuracy   cycles  power   reward     voted`);
  console.log(`  ─────────────────────────────────────────────────────────────────────────`);
  rows.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padEnd(2)} ${short(r.addr)}  ${usdc(r.shares).padStart(10)}  ${pct(r.acc).padStart(8)}  ${String(r.cycles).padStart(5)}  ${(Number(r.power) / 100).toFixed(1).padStart(5)}%  ${usdc(r.credit).padStart(8)}  ${voterSet.has(r.addr.toLowerCase()) ? "✓" : " "}`,
    );
  });
  if (rows.length === 0) console.log("  (no members yet — deposit to join)");
  console.log("");
}

main().catch((e) => { console.error(`error: ${(e as Error).message}`); process.exit(1); });
