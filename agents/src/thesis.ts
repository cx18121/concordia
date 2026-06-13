import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NAMES, type Ticker } from "./universe.js";
import type { StrategyId, StrategyPick } from "./strategies.js";

/**
 * LLM thesis layer: one short, human-readable rationale per vote.
 *
 * The strategy makes the *decision*; the LLM only writes the *narrative*. Outputs are cached
 * to disk keyed by (strategy, cycle, picks) so the live app never blocks on an API call —
 * theses are precomputed and served instantly. If ANTHROPIC_API_KEY is unset, a deterministic
 * template fallback is used so the package runs fully offline.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, "..", "data", "thesis-cache.json");

type Cache = Record<string, string>;

function loadCache(): Cache {
  try {
    if (existsSync(CACHE_PATH)) return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch { /* ignore corrupt cache */ }
  return {};
}

function saveCache(cache: Cache) {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

const cache = loadCache();

function key(strategy: StrategyId, cycle: number, pick: StrategyPick): string {
  const top = pick.allocations.map((a) => `${a.ticker}:${a.weightBps}`).join(",");
  return `${strategy}|c${cycle}|${top}`;
}

const STRATEGY_VOICE: Record<StrategyId, string> = {
  momentum: "a momentum trader chasing the strongest 4-week trend",
  value: "a value investor favoring steady names that haven't run up",
  "mean-reversion": "a mean-reversion trader buying last week's oversold losers",
  sector: "a sector-rotation strategist concentrating in the hottest sector",
  "low-vol": "a low-volatility allocator preferring the calmest names",
  contrarian: "a contrarian betting against the crowd's recent winners",
};

/** Deterministic fallback — no API needed. Reads naturally and names the top pick. */
function templateThesis(strategy: StrategyId, pick: StrategyPick): string {
  const top = pick.rationale[0];
  if (!top) return "No conviction names this cycle.";
  const name = NAMES[top.ticker];
  const others = pick.allocations
    .filter((a) => a.ticker !== top.ticker)
    .map((a) => a.ticker);
  const lead = pick.allocations.find((a) => a.ticker === top.ticker)?.weightBps ?? 0;
  const pct = Math.round(lead / 100);

  const reason: Record<StrategyId, string> = {
    momentum: `${name} (${top.ticker}) shows the cleanest 4-week trend in the universe — riding the leader at ${pct}%`,
    value: `${name} (${top.ticker}) is the steadiest underpriced name — accumulating at ${pct}% while froth cools elsewhere`,
    "mean-reversion": `${name} (${top.ticker}) sold off hardest last week and is stretched below trend — fading the move at ${pct}%`,
    sector: `${top.ticker}'s sector is leading on relative strength — rotating ${pct}% into the strongest name`,
    "low-vol": `${name} (${top.ticker}) offers the best calm-to-trend ratio — sizing up the low-vol anchor at ${pct}%`,
    contrarian: `${name} (${top.ticker}) is the most beaten-down name — taking the other side at ${pct}%`,
  };

  const tail = others.length ? ` Balancing with ${others.join(", ")}.` : "";
  return `${reason[strategy]}.${tail}`;
}

/** Generate (or fetch from cache) the thesis for one agent's vote this cycle. */
export async function getThesis(
  strategy: StrategyId,
  cycle: number,
  pick: StrategyPick
): Promise<string> {
  const k = key(strategy, cycle, pick);
  if (cache[k]) return cache[k];

  let text: string;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      text = await llmThesis(strategy, pick);
    } catch {
      text = templateThesis(strategy, pick); // never let the app wait/fail on the API
    }
  } else {
    text = templateThesis(strategy, pick);
  }

  cache[k] = text;
  saveCache(cache);
  return text;
}

async function llmThesis(strategy: StrategyId, pick: StrategyPick): Promise<string> {
  // lazy import so the package runs without the dep installed when offline
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const picks = pick.allocations
    .map((a) => `${a.ticker} ${Math.round(a.weightBps / 100)}%`)
    .join(", ");

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 90,
    messages: [
      {
        role: "user",
        content:
          `You are ${STRATEGY_VOICE[strategy]} in a community hedge-fund DAO. ` +
          `This cycle you allocated: ${picks}. ` +
          `Write ONE punchy sentence (max 30 words) justifying the top pick in your strategy's voice. ` +
          `No preamble, no hedging, no emoji.`,
      },
    ],
  });

  const block = msg.content[0];
  return block && block.type === "text" ? block.text.trim() : templateThesis(strategy, pick);
}
