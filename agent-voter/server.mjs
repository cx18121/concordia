// Concordia Auto-Voter — a tiny local dashboard.
//
// You paste your Concordia agent secret (cfsk_…) and pick a model. One button:
// a local AI model reads the live cycle + universe from Concordia's agent API,
// decides an allocation, and casts the vote through POST /api/agent/vote.
//
// Default brain is a LOCAL Ollama model — no key, no cloud, zero dependencies
// (built-in fetch). Claude is optional: drop an Anthropic key in .env and the
// official @anthropic-ai/sdk is loaded on demand. The Concordia agent API is a
// plain REST service, so those calls are fetch().

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PORT = Number(process.env.PORT) || 4500;
const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(__dirname, "index.html"), "utf8");

// The Anthropic key lives on the server, never in the dashboard. Load it from a
// local .env (one KEY=value per line) — re-read on each vote so you can drop the
// key in without restarting. new Anthropic() then resolves it from process.env.
function loadEnv() {
  try {
    for (const line of readFileSync(join(__dirname, ".env"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env — fall back to the ambient environment */
  }
}
loadEnv();

const CLAUDE_MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"];
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/+$/, "");

const hasAnthropicKey = () =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

// Ask Claude (official SDK) for the allocation, constrained to the JSON schema.
// The SDK is imported on demand so the Ollama-only path needs no `npm install`.
async function askAnthropic(model, system, user) {
  let Anthropic;
  try {
    ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
  } catch {
    throw new Error(
      "Claude needs the SDK — run `npm install` in this folder, or pick a local Ollama model.",
    );
  }
  const client = new Anthropic();
  const resp = await client.messages.create({
    model: CLAUDE_MODELS.includes(model) ? model : "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema: VOTE_SCHEMA }, effort: "low" },
  });
  const block = resp.content.find((b) => b.type === "text");
  if (!block) throw new Error("Claude returned no text output.");
  return block.text;
}

// Ask a local Ollama model (no key, no cloud). format:"json" forces a JSON body;
// think:false keeps reasoning models from prepending <think> noise.
async function askOllama(model, system, user) {
  let r;
  try {
    r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        think: false,
        options: { temperature: 0.4 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch {
    throw new Error(`Couldn't reach Ollama at ${OLLAMA_URL}. Is it running? (\`ollama serve\`)`);
  }
  if (!r.ok) throw new Error(`Ollama error ${r.status}. Is the model "${model}" pulled? (\`ollama pull ${model}\`)`);
  const d = await r.json();
  const text = d?.message?.content ?? "";
  if (!text) throw new Error("Ollama returned an empty response.");
  return text;
}

// List locally-available Ollama models (empty array if the server is down).
async function ollamaModels() {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.models ?? []).map((m) => m.name).filter(Boolean);
  } catch {
    return [];
  }
}

// Structured-output schema for Claude's decision. (Numeric bounds aren't part
// of JSON-schema structured outputs, so the 0–100 / sum-100 rules are enforced
// in normalizePicks() + by Concordia's own /vote validation.)
const VOTE_SCHEMA = {
  type: "object",
  properties: {
    thesis: { type: "string" },
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: { ticker: { type: "string" }, pct: { type: "integer" } },
        required: ["ticker", "pct"],
        additionalProperties: false,
      },
    },
  },
  required: ["thesis", "picks"],
  additionalProperties: false,
};

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "content-type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

// Keep only known tickers, dedupe, force integer percents summing to exactly
// 100 (Concordia rejects anything else). Drift from rounding is added to the
// largest position.
function normalizePicks(raw, universe) {
  const seen = new Set();
  let out = [];
  for (const p of raw ?? []) {
    const t = String(p?.ticker ?? "").toUpperCase();
    if (!universe.includes(t) || seen.has(t)) continue;
    const pct = Math.max(0, Math.round(Number(p?.pct) || 0));
    if (pct <= 0) continue;
    seen.add(t);
    out.push({ ticker: t, pct });
  }
  if (out.length === 0) return [];
  let sum = out.reduce((s, p) => s + p.pct, 0);
  if (sum !== 100) {
    out = out.map((p) => ({ ticker: p.ticker, pct: Math.round((p.pct * 100) / sum) }));
    out = out.filter((p) => p.pct > 0);
    out.sort((a, b) => b.pct - a.pct);
    sum = out.reduce((s, p) => s + p.pct, 0);
    if (out.length) out[0].pct += 100 - sum; // absorb rounding drift
  }
  return out;
}

// Parse Claude's text block as JSON, tolerating a stray prose wrapper.
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
    throw new Error("The model's output was not valid JSON.");
  }
}

async function run({ concordiaUrl, agentKey, model }) {
  const base = String(concordiaUrl).replace(/\/+$/, "");
  const auth = { authorization: `Bearer ${agentKey}` };

  // 1) Read live state from Concordia's agent API.
  const [cycleR, uniR, meR] = await Promise.all([
    fetch(`${base}/api/agent/cycle`),
    fetch(`${base}/api/agent/universe`),
    fetch(`${base}/api/agent/me`, { headers: auth }),
  ]);
  if (meR.status === 401) {
    throw new Error("Concordia rejected the agent key (401). Check the cfsk_… secret and the API URL.");
  }
  if (!cycleR.ok || !uniR.ok) {
    throw new Error(`Couldn't reach Concordia at ${base} (cycle ${cycleR.status}, universe ${uniR.status}).`);
  }
  const cycle = await cycleR.json();
  const universe = await uniR.json();
  const me = await meR.json();
  const tickers = universe.tickers ?? [];
  const prices = universe.prices ?? {};
  const priceList = tickers.map((t) => `${t}: $${prices[t]}`).join(", ");

  // 2) Pick the brain: Claude (needs a server key) or a local Ollama model.
  const useClaude = String(model).startsWith("claude-");
  const system =
    "You are an autonomous portfolio agent voting in Concordia, a community hedge-fund DAO. " +
    "Each cycle you allocate 100% of your voting weight across a stock universe. Pick the 3-6 " +
    "tickers you are most bullish on for the coming week and assign integer percentages that " +
    "sum to exactly 100. Use only tickers from the provided universe. Be decisive and concise. " +
    "Respond ONLY with a JSON object of the form {\"thesis\": string, \"picks\": [{\"ticker\": string, \"pct\": integer}]}.";
  const user =
    `Universe (ticker: price): ${priceList}.\n` +
    `Current cycle: #${cycle.id} (${cycle.state}), ~${cycle.secondsLeft}s left in the voting window.\n` +
    `Your voting power: ${me.votingPowerPct ?? "?"}%.\n` +
    `Decide your allocation now and give a one-sentence thesis.`;

  let raw;
  let usedModel = model;
  if (useClaude) {
    loadEnv(); // pick up a freshly-added key without a restart
    if (!hasAnthropicKey()) {
      throw new Error(
        "No Anthropic key configured. Add ANTHROPIC_API_KEY to concordia-voter/.env, or pick a local (Ollama) model.",
      );
    }
    usedModel = CLAUDE_MODELS.includes(model) ? model : "claude-opus-4-8";
    raw = await askAnthropic(usedModel, system, user);
  } else {
    raw = await askOllama(model, system, user);
  }

  const decision = parseJson(raw);
  const picks = normalizePicks(decision.picks, tickers);
  if (picks.length === 0) {
    throw new Error("The model didn't return any valid picks for this universe — try again, or use a stronger model.");
  }

  // 3) Cast the vote through the agent API.
  const voteR = await fetch(`${base}/api/agent/vote`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ picks }),
  });
  const vote = await voteR.json().catch(() => ({}));
  if (!voteR.ok) throw new Error(`Concordia rejected the vote: ${vote.error ?? voteR.status}`);

  return {
    provider: useClaude ? "Claude" : "Ollama",
    model: usedModel,
    cycle,
    keyId: me.keyId,
    votingPowerPct: me.votingPowerPct,
    thesis: decision.thesis,
    picks,
    vote,
  };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      return send(res, 200, HTML, "text/html; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/api/models") {
      loadEnv();
      const [ollama] = await Promise.all([ollamaModels()]);
      return send(res, 200, {
        claude: hasAnthropicKey() ? CLAUDE_MODELS : [],
        ollama,
      });
    }
    if (req.method === "POST" && req.url === "/api/run") {
      const body = JSON.parse((await readBody(req)) || "{}");
      if (!body.concordiaUrl || !body.agentKey) {
        return send(res, 400, { error: "Concordia URL and agent key are required." });
      }
      return send(res, 200, await run(body));
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: e?.message ?? String(e) });
  }
});

server.listen(PORT, () => console.log(`Concordia Auto-Voter → http://localhost:${PORT}`));
