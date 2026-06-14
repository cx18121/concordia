import { NextResponse } from "next/server";
import { authKey } from "@/lib/agentApi";

// GET /api/agent/me — the calling key's identity, voting power, and last vote.
// Auth: Authorization: Bearer <secret>.
export async function GET(req: Request) {
  const rec = await authKey(req);
  if (!rec) {
    return NextResponse.json(
      { error: "invalid or missing API key" },
      { status: 401 },
    );
  }
  return NextResponse.json({
    keyId: rec.keyId,
    votingPowerPct: rec.votingPowerPct,
    lastVote: rec.lastVote,
    votedAt: rec.votedAt,
  });
}
