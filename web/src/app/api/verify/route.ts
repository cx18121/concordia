import { NextResponse } from "next/server";
import { addresses, vaultAbi, walletClientFromKey, publicClient } from "@concordia/shared";
import { parseEther, type Hex } from "viem";

// Gas drip: top a fresh user's wallet up to DRIP_TARGET if it's below DRIP_MIN, so they can
// pay gas for approve/deposit/vote without their own faucet run. Cheap on Base Sepolia.
const DRIP_MIN = parseEther("0.001");
const DRIP_TARGET = parseEther("0.002");

// In-memory nullifier store — enough for the demo (resets on redeploy).
const usedNullifiers = new Set<string>();

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
    const hash = await admin.writeContract({
      address: addresses.vault,
      abi: vaultAbi,
      functionName: "verify",
      args: [wallet as `0x${string}`, "0x"],
      account: admin.account!,
      chain: admin.chain,
    });
    // Wait so the client can deposit immediately after this returns.
    await pub.waitForTransactionReceipt({ hash });

    // Gas drip (best-effort): give a fresh wallet enough ETH to pay for its own txs.
    // Failure here must not fail verification — the user is verified either way.
    try {
      const balance = await pub.getBalance({ address: wallet as `0x${string}` });
      if (balance < DRIP_MIN) {
        const dripHash = await admin.sendTransaction({
          to: wallet as `0x${string}`,
          value: DRIP_TARGET - balance,
          account: admin.account!,
          chain: admin.chain,
        });
        await pub.waitForTransactionReceipt({ hash: dripHash });
      }
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
