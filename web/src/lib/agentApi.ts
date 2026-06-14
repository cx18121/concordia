// Agent HTTP API — server-side store + helpers (NOT "use client"; runs only in
// the /api/agent/* route handlers). This is the real Model B from
// docs/agent-integration.md: a bot authenticates with a Bearer key and votes
// over JSON, the same allocation a human casts in the UI.
//
// Key store uses @vercel/kv when KV_REST_API_URL is set (so keys persist across
// Vercel's serverless instances), with an in-memory fallback for local dev —
// the same pattern as the forum store. The endpoints are origin-relative, so a
// bot just hits whatever domain the app is deployed to. In a full live deploy
// recordVote() would additionally sign castVote() with the key's Dynamic server
// wallet.

export interface AgentPick {
  ticker: string;
  pct: number;
}

export interface AgentKey {
  keyId: string;
  secret: string;
  createdAt: number;
  votingPowerPct: number;
  lastVote: AgentPick[] | null;
  votedAt: number | null;
}

// Seeded universe + prices (mirrors the mock's 18-asset set). Self-contained so
// the API has no client/SDK import.
export const PRICES: Record<string, number> = {
  AAPL: 229.87, MSFT: 467.21, NVDA: 131.45, GOOGL: 178.34, AMZN: 201.66,
  META: 591.08, TSLA: 342.19, JPM: 248.73, XOM: 114.2, UNH: 492.1,
  WMT: 67.34, SPY: 543.12, QQQ: 470.55, XLK: 231.4, XLF: 41.2,
  XLE: 91.85, XLV: 145.3, ARKK: 46.1,
};
export const UNIVERSE = Object.keys(PRICES);

const CYCLE_SECONDS = 5 * 60;
const FIRST_CYCLE_ID = 7;

// ---------------------------------------------------------------------------
// Key store — KV in production (shared across serverless instances), in-memory
// for local dev. Keyed by secret (the Bearer token).
// ---------------------------------------------------------------------------
const KV_KEY = "concordia:agentkeys:v1";
let _mem: Record<string, AgentKey> | null = null;

async function loadKeys(): Promise<Record<string, AgentKey>> {
  if (process.env.KV_REST_API_URL) {
    try {
      const { kv } = await import("@vercel/kv");
      return (await kv.get<Record<string, AgentKey>>(KV_KEY)) ?? {};
    } catch {
      return {};
    }
  }
  if (_mem === null) _mem = {};
  return _mem;
}

async function saveKeys(store: Record<string, AgentKey>): Promise<void> {
  if (process.env.KV_REST_API_URL) {
    try {
      const { kv } = await import("@vercel/kv");
      await kv.set(KV_KEY, store);
    } catch {
      /* ignore — best effort */
    }
  } else {
    _mem = store;
  }
}

// ---------------------------------------------------------------------------
// Cycle clock — a looping window so bots get a real countdown. Lazily anchored
// per instance; the id/secondsLeft stay valid regardless of which instance
// answers (the exact id is informational for the demo).
// ---------------------------------------------------------------------------
let cycleEpoch = 0;
function epoch(): number {
  if (!cycleEpoch) cycleEpoch = Date.now();
  return cycleEpoch;
}

export interface AgentCycle {
  id: number;
  state: "OPEN";
  secondsLeft: number;
  votingWindowEndsAt: number;
}

export function serverCycle(): AgentCycle {
  const elapsed = (Date.now() - epoch()) / 1000;
  const idx = Math.floor(elapsed / CYCLE_SECONDS);
  const secondsLeft = Math.ceil(CYCLE_SECONDS - (elapsed % CYCLE_SECONDS));
  return {
    id: FIRST_CYCLE_ID + idx,
    state: "OPEN",
    secondsLeft,
    votingWindowEndsAt: epoch() + (idx + 1) * CYCLE_SECONDS * 1000,
  };
}

function rnd(len: number, alphabet: string): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

// Deterministic voting power for a minted key: derived from the keyId so the same
// key always reports the same weight (not a per-mint random roll). Still a demo
// stub — a live deploy reads real on-chain power (capital + accuracy). Maps the
// keyId hash into a plausible 4–12% peer share.
function votingPowerFor(keyId: string): number {
  let h = 0;
  for (let i = 0; i < keyId.length; i++) h = (h * 31 + keyId.charCodeAt(i)) >>> 0;
  return Math.round((4 + (h % 801) / 100) * 100) / 100; // 4.00–12.00
}

/** Mint + persist a fresh key. Returns the credential (secret shown once). */
export async function issueKey(): Promise<{ keyId: string; secret: string }> {
  const keyId = "CK" + rnd(18, "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789");
  const secret = "cfsk_" + rnd(24, "abcdefghijkmnpqrstuvwxyz0123456789");
  const store = await loadKeys();
  store[secret] = {
    keyId,
    secret,
    createdAt: Date.now(),
    votingPowerPct: votingPowerFor(keyId),
    lastVote: null,
    votedAt: null,
  };
  await saveKeys(store);
  return { keyId, secret };
}

/** Resolve the `Authorization: Bearer <secret>` header to a stored key. */
export async function authKey(req: Request): Promise<AgentKey | null> {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const store = await loadKeys();
  return store[m[1].trim()] ?? null;
}

/** Validate + persist a vote for the key. picks must sum to 100, known tickers. */
export async function recordVote(
  secret: string,
  picks: unknown,
): Promise<
  | { ok: true; lastVote: AgentPick[]; votedAt: number }
  | { ok: false; error: string }
> {
  if (!Array.isArray(picks) || picks.length === 0) {
    return { ok: false, error: "picks must be a non-empty array of { ticker, pct }" };
  }
  let sum = 0;
  for (const p of picks) {
    if (typeof p?.ticker !== "string" || typeof p?.pct !== "number") {
      return { ok: false, error: "each pick needs a string ticker and number pct" };
    }
    if (!UNIVERSE.includes(p.ticker)) {
      return { ok: false, error: `unknown ticker "${p.ticker}"` };
    }
    sum += p.pct;
  }
  if (Math.round(sum) !== 100) {
    return { ok: false, error: `picks must sum to 100 (got ${sum})` };
  }
  const store = await loadKeys();
  const rec = store[secret];
  if (!rec) return { ok: false, error: "invalid or missing API key" };
  rec.lastVote = picks.map((p) => ({ ticker: p.ticker, pct: p.pct }));
  rec.votedAt = Date.now();
  store[secret] = rec;
  await saveKeys(store);
  return { ok: true, lastVote: rec.lastVote, votedAt: rec.votedAt };
}
