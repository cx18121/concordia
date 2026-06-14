import express, { type Request, type Response } from "express";
import { InMemoryKeyStore } from "./keys.js";
import { authMiddleware, requireScope } from "./auth.js";
import {
  LocalGovernance,
  OnChainGovernance,
  toAllocations,
  VoteValidationError,
  VoteCycleError,
  type GovernanceAdapter,
} from "./governance.js";
import { clock, universeWithPrices, accountFor } from "./state.js";
import { ONCHAIN, realCycle, signerAddress } from "./chain.js";

/**
 * Bot voting API (Alpaca-style). A user's bot authenticates with a key+secret issued in the UI
 * and votes programmatically through the same Governance.castVote path a human uses. Vote-only —
 * keys can never deposit or withdraw.
 *
 *   npm run dev      # http://localhost:8787
 *
 * Endpoints:
 *   POST /v1/keys                 issue a key (admin / called by the "Generate new keys" button)
 *   GET  /v1/clock                cycle phase + countdowns (no auth)
 *   GET  /v1/universe             tradable assets + prices (no auth)
 *   GET  /v1/account              the bot's member account (auth)
 *   GET  /v1/cycle                current cycle + your latest vote (auth)
 *   POST /v1/votes                submit an allocation (auth, vote scope)
 *   DELETE /v1/keys/:keyId        revoke a key (admin)
 */

const PORT = Number(process.env.PORT ?? 8787);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "dev-admin-token";

const keys = new InMemoryKeyStore();
// On-chain when BOT_SIGNER_PK is set (real Governance.castVote txs); in-memory sim otherwise.
const gov: GovernanceAdapter = ONCHAIN ? new OnChainGovernance() : new LocalGovernance();
const lastVote = new Map<string, { allocs: { asset: string; weightBps: number }[]; cycle: number; txHash: string; at: string }>();

const app = express();
app.use(express.json());

// request log
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString().slice(11, 19)}  ${req.method} ${req.path}`);
  next();
});

/* ── Health ─────────────────────────────────────────────── */
app.get("/health", (_req, res) => res.json({ ok: true, service: "bot-api" }));

/* ── Admin: issue / revoke keys ─────────────────────────── */
function requireAdmin(req: Request, res: Response, next: express.NextFunction) {
  if (req.header("X-Admin-Token") !== ADMIN_TOKEN) {
    return res.status(401).json({ code: 40110002, message: "admin token required" });
  }
  next();
}

// Called by the UI's "Generate new keys" button once wired (server-side, after World ID verify).
app.post("/v1/keys", requireAdmin, (req, res) => {
  const { wallet, label } = req.body ?? {};
  if (typeof wallet !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return res.status(400).json({ code: 40010000, message: "valid `wallet` (0x…40 hex) required" });
  }
  const issued = keys.issue(wallet as `0x${string}`, typeof label === "string" ? label : "bot");
  // secret is returned ONCE here and never again
  res.status(201).json({
    keyId: issued.keyId,
    secret: issued.secret,
    wallet: issued.wallet,
    label: issued.label,
    scopes: ["vote"],
    note: "Store the secret now — it is shown only once.",
  });
});

app.delete("/v1/keys/:keyId", requireAdmin, (req, res) => {
  const ok = keys.revoke(req.params.keyId ?? "");
  res.status(ok ? 200 : 404).json({ revoked: ok });
});

/* ── Public reads ───────────────────────────────────────── */
app.get("/v1/clock", async (_req, res) =>
  res.json(ONCHAIN ? { ...clock(), ...(await realCycle()), onchain: true } : clock()),
);
app.get("/v1/universe", (_req, res) => res.json({ assets: universeWithPrices() }));

/* ── Authenticated bot routes ───────────────────────────── */
app.use("/v1/account", authMiddleware(keys));
app.get("/v1/account", (req, res) => res.json(accountFor(req.apiKey!.wallet)));

app.use("/v1/cycle", authMiddleware(keys));
app.get("/v1/cycle", async (req, res) => {
  const c = ONCHAIN ? { ...clock(), ...(await realCycle()), onchain: true } : clock();
  const mine = lastVote.get(req.apiKey!.wallet) ?? null;
  res.json({ ...c, myVote: mine });
});

app.use("/v1/votes", authMiddleware(keys), requireScope("vote"));
app.post("/v1/votes", async (req, res) => {
  // Gate on the real cycle when on-chain (the sim clock would be wrong); else the in-memory clock.
  const sim = clock();
  const cycleNum = ONCHAIN ? (await realCycle()).cycle : sim.cycle;
  const isOpen = ONCHAIN ? (await realCycle()).isOpen : sim.isOpen;
  if (!isOpen) {
    return res.status(409).json({
      code: 40910000,
      message: ONCHAIN
        ? `on-chain cycle ${cycleNum} is not OPEN — wait for the next voting window`
        : `voting is closed for cycle ${sim.cycle}; next opens in ${Math.ceil(sim.nextCycleInMs / 1000)}s`,
    });
  }
  try {
    const allocs = toAllocations(req.body?.allocations ?? req.body);
    const { txHash } = await gov.castVote(req.apiKey!.wallet, allocs);
    const record = {
      allocs: (req.body?.allocations ?? req.body) as { asset: string; weightBps: number }[],
      cycle: cycleNum,
      txHash,
      at: new Date().toISOString(),
    };
    lastVote.set(req.apiKey!.wallet, record);
    console.log(`  vote: ${req.apiKey!.wallet} cycle ${cycleNum} → ${txHash}`);
    res.status(201).json({ status: "accepted", cycle: cycleNum, txHash, allocations: allocs });
  } catch (e) {
    if (e instanceof VoteValidationError) {
      return res.status(400).json({ code: 40010001, message: e.message });
    }
    if (e instanceof VoteCycleError) {
      return res.status(409).json({ code: 40910001, message: e.message });
    }
    console.error(e);
    res.status(500).json({ code: 50000000, message: (e as Error)?.message ?? "internal error" });
  }
});

/* ── 404 ────────────────────────────────────────────────── */
app.use((_req, res) => res.status(404).json({ code: 40400000, message: "not found" }));

app.listen(PORT, () => {
  console.log(`bot-api listening on http://localhost:${PORT}`);
  console.log(`admin token: ${ADMIN_TOKEN}  (set ADMIN_TOKEN to override)`);
  if (ONCHAIN) {
    console.log(`mode: ON-CHAIN — votes are real Governance.castVote txs`);
    console.log(`bot signer: ${signerAddress()}  (must be verified + funded + deposited)`);
  } else {
    console.log(`mode: SIM (in-memory) — set BOT_SIGNER_PK to vote on-chain`);
  }
});

export { app, keys, gov };
