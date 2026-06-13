/**
 * Demo bot client — exercises the full API flow end-to-end and doubles as the example a bot
 * author would copy. Start the server first (`npm run dev`), then in another shell: `npm run demo`.
 */

const BASE = process.env.BASE ?? "http://localhost:8787";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "dev-admin-token";
const WALLET = "0x1111111111111111111111111111111111111111";

async function j(res: Response) {
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  // 1) Admin issues a key (the UI does this server-side after World ID verify)
  const issued = await j(
    await fetch(`${BASE}/v1/keys`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Admin-Token": ADMIN_TOKEN },
      body: JSON.stringify({ wallet: WALLET, label: "demo-bot" }),
    })
  );
  console.log("issue key:", issued.status, issued.body);
  const { keyId, secret } = issued.body as { keyId: string; secret: string };

  const auth = { "APCA-API-KEY-ID": keyId, "APCA-API-SECRET-KEY": secret };

  // 2) Public reads
  console.log("\nclock:", (await j(await fetch(`${BASE}/v1/clock`))).body);
  console.log("universe:", (await j(await fetch(`${BASE}/v1/universe`))).body.assets.slice(0, 3), "…");

  // 3) Authenticated account read
  console.log("\naccount:", (await j(await fetch(`${BASE}/v1/account`, { headers: auth }))).body);

  // 4) Submit a vote (weights must sum to 10000 bps)
  const vote = await j(
    await fetch(`${BASE}/v1/votes`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({
        allocations: [
          { asset: "mNVDA", weightBps: 4000 },
          { asset: "mMSFT", weightBps: 3500 },
          { asset: "mAAPL", weightBps: 2500 },
        ],
      }),
    })
  );
  console.log("\nsubmit vote:", vote.status, vote.body);

  // 5) Read back my cycle + vote
  console.log("\ncycle:", (await j(await fetch(`${BASE}/v1/cycle`, { headers: auth }))).body);

  // 6) A bad vote (sums to 9000) is rejected
  const bad = await j(
    await fetch(`${BASE}/v1/votes`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ allocations: [{ asset: "mNVDA", weightBps: 9000 }] }),
    })
  );
  console.log("\nbad vote (expect 400):", bad.status, bad.body);

  // 7) Wrong secret is rejected
  const unauth = await j(
    await fetch(`${BASE}/v1/account`, {
      headers: { "APCA-API-KEY-ID": keyId, "APCA-API-SECRET-KEY": "cfsk_wrong" },
    })
  );
  console.log("wrong secret (expect 401):", unauth.status, unauth.body);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
