import { NextResponse } from "next/server";
import { walletClientFromKey, publicClient } from "@concordia/shared";
import { parseEther, type Hex } from "viem";

// Ensure a fresh embedded wallet can pay gas for the live fund flow (mint -> approve ->
// deposit). The wallet is a plain EOA with no ETH, so the admin sponsors it: the CDP
// faucet if configured (doesn't drain the admin), else an admin-wallet transfer.
//
// /api/verify already drips on a best-effort basis, but that can silently fail (the admin
// EOA is shared with the keeper, so nonce races happen) or be stale by the time the user
// claims. This route runs right before the writes, waits for the receipt, and surfaces
// failure as an error — so Claim never hangs silently waiting on gas it doesn't have.
const DRIP_MIN = parseEther("0.0003"); // top up only if the user has less than this
const DRIP_TARGET = parseEther("0.0008"); // covers mint + approve + deposit with headroom

type Pub = ReturnType<typeof publicClient>;
type Admin = ReturnType<typeof walletClientFromKey>;

/** Retry on nonce/replacement races — the admin and keeper share one EOA. */
async function sendWithRetry(send: () => Promise<Hex>, tries = 4): Promise<Hex> {
  for (let i = 0; i < tries; i++) {
    try {
      return await send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const racy = /nonce|replacement transaction underpriced|already known/i.test(msg);
      if (!racy || i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

async function dripViaCdp(pub: Pub, wallet: `0x${string}`): Promise<boolean> {
  if (!(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET && process.env.CDP_WALLET_SECRET)) {
    return false;
  }
  const { CdpClient } = await import("@coinbase/cdp-sdk");
  const cdp = new CdpClient();
  const { transactionHash } = await cdp.evm.requestFaucet({
    address: wallet, network: "base-sepolia", token: "eth",
  });
  await pub.waitForTransactionReceipt({ hash: transactionHash as Hex });
  return true;
}

export async function POST(request: Request): Promise<Response> {
  const { user } = await request.json().catch(() => ({}));
  if (!user || !/^0x[0-9a-fA-F]{40}$/.test(user)) {
    return NextResponse.json({ error: "Missing or invalid wallet address" }, { status: 400 });
  }
  const addr = user as `0x${string}`;
  const pub = publicClient();

  // Already funded — nothing to do.
  if ((await pub.getBalance({ address: addr })) >= DRIP_MIN) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Preferred: CDP faucet (1000 claims/day, doesn't touch the admin wallet).
  try {
    if (await dripViaCdp(pub, addr)) return NextResponse.json({ ok: true, source: "cdp" });
  } catch (e) {
    console.warn("[fund-gas] CDP faucet failed, falling back to admin drip:", e);
  }

  // Fallback: transfer from the admin wallet.
  const adminKey = process.env.ADMIN_PRIVATE_KEY as Hex | undefined;
  if (!adminKey) {
    return NextResponse.json({ error: "Server missing ADMIN_PRIVATE_KEY" }, { status: 500 });
  }
  const admin: Admin = walletClientFromKey(adminKey);
  const balance = await pub.getBalance({ address: addr });
  if ((await pub.getBalance({ address: admin.account!.address })) < DRIP_TARGET) {
    return NextResponse.json(
      { error: "Gas sponsor wallet is empty — top up the admin wallet with Base Sepolia ETH." },
      { status: 503 },
    );
  }
  try {
    const hash = await sendWithRetry(() =>
      admin.sendTransaction({
        to: addr, value: DRIP_TARGET - balance, account: admin.account!, chain: admin.chain,
      }),
    );
    await pub.waitForTransactionReceipt({ hash });
    return NextResponse.json({ ok: true, source: "admin", txHash: hash });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gas sponsorship failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
