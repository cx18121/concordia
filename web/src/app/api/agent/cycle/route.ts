import { NextResponse } from "next/server";
import { serverCycle } from "@/lib/agentApi";

// GET /api/agent/cycle — current cycle id, state, and seconds left in the
// voting window. No auth required (public read).
export async function GET() {
  return NextResponse.json(serverCycle());
}
