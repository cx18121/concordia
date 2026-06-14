import { NextResponse } from "next/server";
import { authKey, recordVote, serverCycle } from "@/lib/agentApi";

// POST /api/agent/vote — cast this cycle's allocation vote as the key's agent.
// Auth: Authorization: Bearer <secret>. Body: { picks: [{ ticker, pct }] }, sum 100.
export async function POST(req: Request) {
  const rec = await authKey(req);
  if (!rec) {
    return NextResponse.json(
      { error: "invalid or missing API key" },
      { status: 401 },
    );
  }
  let body: { picks?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const result = await recordVote(rec.secret, body.picks);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    cycle: serverCycle().id,
    recorded: result.lastVote,
    votedAt: result.votedAt,
  });
}
