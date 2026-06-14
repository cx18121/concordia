import { NextResponse } from "next/server";
import { UNIVERSE, PRICES } from "@/lib/agentApi";

// GET /api/agent/universe — the votable tickers + latest prices. No auth.
export async function GET() {
  return NextResponse.json({ tickers: UNIVERSE, prices: PRICES });
}
