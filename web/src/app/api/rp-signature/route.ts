import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit";

export async function POST(request: Request): Promise<Response> {
  const { action } = await request.json();

  const { sig, nonce, createdAt, expiresAt } = signRequest({
    signingKeyHex: process.env.RP_SIGNING_KEY!,
    action,
  });

  return NextResponse.json({
    rp_id: process.env.WORLD_RP_ID!,
    sig,
    nonce,
    created_at: createdAt,
    expires_at: expiresAt,
  });
}
