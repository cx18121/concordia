import { NextResponse } from "next/server";

// In-memory nullifier store — enough for the demo.
// Once Vault is deployed, swap for Vault.verify(walletAddress, proof) on-chain.
const usedNullifiers = new Set<string>();

export async function POST(request: Request): Promise<Response> {
  const { idkitResponse } = await request.json();

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

  return NextResponse.json({ success: true });
}