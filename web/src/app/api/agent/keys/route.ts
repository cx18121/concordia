import { NextResponse } from "next/server";
import { issueKey } from "@/lib/agentApi";

// POST /api/agent/keys — mint a new agent API key (keyId + secret). The secret
// is shown once; it's the Bearer token for /api/agent/me and /api/agent/vote.
export async function POST() {
  return NextResponse.json(await issueKey());
}
