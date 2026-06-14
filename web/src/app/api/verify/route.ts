import { NextResponse } from "next/server";
import { addresses, vaultAbi, walletClientFromKey, publicClient } from "@concordia/shared";
import { parseEther, type Hex } from "viem";

// Fallback gas drip (admin wallet): top a fresh user up to DRIP_TARGET if below DRIP_MIN.
// Only used when CDP faucet creds are absent. Base Sepolia gas is ~0.007 gwei, so a full
// user flow (~450k gas) costs ~0.000003 ETH — 0.0005 is ample headroom.
const DRIP_MIN = parseEther("0.0002");
const DRIP_TARGET = parseEther("0.0005");

// In-memory nullifier store — enough for the demo (resets on redeploy).
const usedNullifiers = new Set<string>();

type Pub = ReturnType<typeof publicClient>;
type Admin = ReturnType<typeof walletClientFromKey>;

/** Retry a tx send on nonce/replacement races. The admin and keeper share one EOA, so a
 *  verify write can collide with the keeper mid-transaction — refetch nonce and retry. */
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

/** Give a fresh wallet gas. Preferred path: the CDP faucet funds the user directly (doesn't
 *  drain the admin wallet; 1000 claims/day). Falls back to an admin-wallet transfer if CDP
 *  creds aren't set. Best-effort — failure must not fail verification. */
async function dripGas(pub: Pub, admin: Admin, wallet: `0x${string}`): Promise<void> {
  if (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET && process.env.CDP_WALLET_SECRET) {
    try {
      const { CdpClient } = await import("@coinbase/cdp-sdk");
      const cdp = new CdpClient();
      const { transactionHash } = await cdp.evm.requestFaucet({
        address: wallet, network: "base-sepolia", token: "eth",
      });
      await pub.waitForTransactionReceipt({ hash: transactionHash });
      return;
    } catch (e) {
      console.warn("[verify] CDP faucet failed, falling back to admin drip:", e);
    }
  }
  const balance = await pub.getBalance({ address: wallet });
  if (balance < DRIP_MIN) {
    const hash = await sendWithRetry(() =>
      admin.sendTransaction({ to: wallet, value: DRIP_TARGET - balance, account: admin.account!, chain: admin.chain }),
    );
    await pub.waitForTransactionReceipt({ hash });
  }
}

export async function POST(request: Request): Promise<Response> {
  const { idkitResponse, wallet } = await request.json();

  // 1. Off-chain: verify the World ID proof via the developer REST endpoint.
  const rpId = process.env.WORLD_RP_ID!;
  const res = await fetch(`https://developer.world.org/api/v4/verify/${rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(idkitResponse),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: (err as { detail?: string })?.detail ?? "Proof verification failed" },
      { status: 400 }
    );
  }

  const nullifier: string | undefined = idkitResponse?.responses?.[0]?.nullifier;
  if (nullifier) {
    if (usedNullifiers.has(nullifier)) {
      return NextResponse.json({ error: "Already verified" }, { status: 409 });
    }
    usedNullifiers.add(nullifier);
  }

  // 2. On-chain: admin attests the wallet so deposits stop reverting NotVerified.
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ error: "Missing or invalid wallet address" }, { status: 400 });
  }
  const adminKey = process.env.ADMIN_PRIVATE_KEY as Hex | undefined;
  if (!adminKey) {
    return NextResponse.json({ error: "Server missing ADMIN_PRIVATE_KEY" }, { status: 500 });
  }

  try {
    const admin = walletClientFromKey(adminKey);
    const pub = publicClient();
    const addr = wallet as `0x${string}`;
    const hash = await sendWithRetry(() =>
      admin.writeContract({
        address: addresses.vault, abi: vaultAbi, functionName: "verify",
        args: [addr, "0x"], account: admin.account!, chain: admin.chain,
      }),
    );
    // Wait so the client can deposit immediately after this returns.
    await pub.waitForTransactionReceipt({ hash });

    // Gas drip (best-effort): a failure here must not fail verification.
    try {
      await dripGas(pub, admin, addr);
    } catch (dripErr) {
      console.warn("[verify] gas drip failed (non-fatal):", dripErr);
    }

    return NextResponse.json({ success: true, txHash: hash });
  } catch (e) {
    // World side is already idempotent (nullifier consumed); surface the chain error.
    const message = e instanceof Error ? e.message : "On-chain verify failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
