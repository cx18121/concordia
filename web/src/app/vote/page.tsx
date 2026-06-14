"use client";

// Vote — cast a weekly allocation vote (Track B, Task B5).
//
// Markup + CSS are ported from redesign/mockups/vote.html. Unlike Overview's
// imperative animation, the allocation control here is *form state*, so it's
// reactified: `alloc` is React state, sliders are controlled, and the mock's
// cap logic (a slider can't push the total over 100) runs on each change.
//
// LIVE bindings: cycle # + countdown from useCycle(), voting power from
// useVotingPower(). Submit builds Pick[] and calls castVote() (mock); after a
// successful submit we reveal a demo-only "resolve cycle now" trigger that
// calls resolveCycle() so accuracy + claim appear on Overview/Account.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import {
  UNIVERSE,
  usePrices,
  useCycle,
  useVotingPower,
  useAccuracy,
  usePosition,
  useFundStats,
  useFundActions,
  PEER_AVG_ACCURACY_PCT,
  type Pick,
} from "@/lib/data";
import {
  loadAgentSecret,
  generateAgentKey,
  maskSecret,
} from "@/lib/agentKey";
import "@/styles/vote.css";

// UNIVERSE is tickers only; this maps each to a display company name for the
// row subtitle + the "Add stock" menu (the mock carried both).
const COMPANY: Record<string, string> = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "Nvidia",
  GOOGL: "Alphabet",
  AMZN: "Amazon",
  META: "Meta",
  TSLA: "Tesla",
  JPM: "JPMorgan",
  XOM: "ExxonMobil",
  UNH: "UnitedHealth",
  WMT: "Walmart",
  SPY: "S&P 500 ETF",
  QQQ: "Nasdaq 100 ETF",
  XLK: "Tech Sector",
  XLF: "Financials Sector",
  XLE: "Energy Sector",
  XLV: "Health Care Sector",
  ARKK: "ARK Innovation",
};

// Seed basket mirrors the mock's initial weights, on OUR plain tickers.
const SEED_ALLOC: Pick[] = [
  { ticker: "NVDA", pct: 40 },
  { ticker: "MSFT", pct: 25 },
  { ticker: "AAPL", pct: 20 },
  { ticker: "TSLA", pct: 15 },
];

function fmtClock(secs: number): string {
  const s = Math.max(0, secs);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function VotePage() {
  const { isVerified } = useAuth();
  const { id, secondsLeft } = useCycle();
  const votingPower = useVotingPower();
  const accuracy = useAccuracy(); // null until the member has been scored
  const position = usePosition();
  const fundStats = useFundStats();
  const prices = usePrices(); // bound so the universe reflects live tickers (B7).
  const { castVote, resolveCycle, startNewCycle, lastVote, canClaim } =
    useFundActions();
  const searchParams = useSearchParams();

  // --- Allocation form state -------------------------------------------------
  // Seed the basket from the recorded vote when one exists, so a submitted vote
  // (basket + "submitted" + "resolved") survives tab switches — these live in
  // the shared data layer, not local state that unmounts on navigation. They
  // reset automatically on a new cycle (NEW_CYCLE clears lastVote + resolved).
  const [alloc, setAlloc] = useState<Pick[]>(() => lastVote ?? SEED_ALLOC);
  const [menuOpen, setMenuOpen] = useState(false);
  const submitted = lastVote !== null;
  const resolved = canClaim;

  const total = alloc.reduce((t, a) => t + a.pct, 0);
  const rounded = Math.round(total);
  // Only tickers in the live universe are votable; available = not yet picked.
  const taken = new Set(alloc.map((a) => a.ticker));
  const available = UNIVERSE.filter(
    (t) => !taken.has(t) && t in prices,
  );

  // Cap logic: a slider can't push the running total over 100 — clamp the new
  // value to (100 - sum of the OTHER rows).
  function setPct(idx: number, raw: number) {
    setAlloc((cur) => {
      const others = cur.reduce((t, a, i) => (i === idx ? t : t + a.pct), 0);
      const v = Math.min(raw, 100 - others);
      return cur.map((a, i) => (i === idx ? { ...a, pct: v } : a));
    });
  }

  function removeRow(idx: number) {
    setAlloc((cur) => cur.filter((_, i) => i !== idx));
  }

  function addTicker(ticker: string) {
    setAlloc((cur) => [...cur, { ticker, pct: 0 }]);
    setMenuOpen(false);
  }

  // Pre-add a ticker from the ?add= query param (linked from forum stock chips).
  useEffect(() => {
    const ticker = searchParams?.get("add")?.toUpperCase().replace(/[^A-Z]/g, "");
    if (!ticker) return;
    // setTimeout defers the setState out of the effect body to avoid the
    // react-hooks/set-state-in-effect lint rule.
    const t = setTimeout(() => {
      setAlloc((cur) => {
        if (cur.some((a) => a.ticker === ticker)) return cur;
        return [...cur, { ticker, pct: 0 }];
      });
    }, 0);
    return () => clearTimeout(t);
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the "Add stock" menu on any outside click (mirrors the mock).
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = () => setMenuOpen(false);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuOpen]);

  // Votable while the cycle is OPEN: verified + basket sums to 100, and the
  // cycle isn't resolved/locked yet. A submitted vote can be RE-cast (changed)
  // any time before the cycle resolves — only a resolved cycle disables it,
  // and the next cycle re-opens it (NEW_CYCLE clears lastVote + resolved).
  const canSubmit = isVerified && rounded === 100 && !resolved;

  async function onSubmit() {
    if (!canSubmit) return;
    await castVote(alloc); // "submitted" derives from the recorded vote
  }

  async function onResolve() {
    await resolveCycle(); // "resolved" derives from canClaim
  }

  async function onNewCycle() {
    await startNewCycle(); // fresh OPEN cycle — clears the vote so you can vote again
  }

  // Backup demo shortcut: Shift+R resolves once a vote is in (visible button
  // is the primary path).
  useEffect(() => {
    if (!submitted || resolved) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "R" || e.key === "r")) onResolve();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, resolved]);

  // --- API keys card (a real, working agent credential) ----------------------
  // "Generate" mints a key server-side (POST /api/agent/keys). A bot then votes
  // with it via POST /api/agent/vote — and we poll /api/agent/me so a vote
  // placed over the API shows up right here in the demo (applied as your vote).
  // The secret is the SAME one shown on Settings → Agent API access (shared via
  // localStorage in lib/agentKey.ts), so both surfaces never drift.
  const [secret, setSecret] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [genLabel, setGenLabel] = useState("Generate API key");
  const [apiActive, setApiActive] = useState(false); // true once a real key is minted
  const [apiNote, setApiNote] = useState<string | null>(null);
  const lastApiVoteRef = useRef<number | null>(null);

  // Pick up a key already minted on this device (here or on Settings) so both
  // surfaces show the same credential and the poller goes live immediately. This
  // is an intentional client-only localStorage read AFTER hydration (a lazy
  // initializer would render the unmasked key on the server -> hydration drift).
  useEffect(() => {
    const s = loadAgentSecret();
    if (!s) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSecret(s);
    setApiActive(true);
  }, []);

  const copySecret = useCallback(() => {
    if (secret && navigator.clipboard) navigator.clipboard.writeText(secret);
  }, [secret]);

  async function generateKeys() {
    setGenLabel("Generating key…");
    try {
      const s = await generateAgentKey(); // mints + caches in localStorage
      setSecret(s);
      setRevealed(true);
      setApiActive(true);
      lastApiVoteRef.current = null;
      setGenLabel("Key generated ✓");
    } catch {
      setGenLabel("Could not generate key, try again");
    }
    window.setTimeout(() => setGenLabel("Generate API key"), 1800);
  }

  // Poll the agent API for votes placed with the active key. When a new one
  // lands, apply it as the cast vote so the demo reflects the bot's trade.
  useEffect(() => {
    if (!apiActive) return;
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/agent/me", {
          headers: { Authorization: `Bearer ${secret}` },
        });
        if (!res.ok) return;
        const me = (await res.json()) as {
          votedAt: number | null;
          lastVote: Pick[] | null;
        };
        if (
          alive &&
          me.votedAt &&
          me.lastVote &&
          me.votedAt !== lastApiVoteRef.current
        ) {
          lastApiVoteRef.current = me.votedAt;
          setAlloc(me.lastVote);
          await castVote(me.lastVote);
          setApiNote(`Vote placed via API · ${me.lastVote.length} positions`);
        }
      } catch {
        /* ignore transient poll errors */
      }
    };
    poll();
    const id = window.setInterval(poll, 3000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [apiActive, secret, castVote]);


  return (
    <div className="wrap">
      <div className="head">
        <div>
          <h1>Cast your vote</h1>
          <div className="sub">
            Cycle #{Number(id)} &middot; voting{" "}
            <b>closes in {fmtClock(secondsLeft)}</b>
          </div>
        </div>
        <div className="vp">
          <div className="k">Your voting power</div>
          <div className="v tnum">{votingPower.toFixed(2)}%</div>
        </div>
      </div>

      {/* Your performance — accuracy + supporting stats, right under voting power.
          accuracy is null until the cycle resolves; returns/capital come from
          usePosition(); community accuracy gives a benchmark to compare against. */}
      <div className="vstats">
        <div className="vstat">
          <div className="k">Your accuracy</div>
          <div
            className={
              "v tnum " +
              (accuracy == null ? "" : accuracy >= 0 ? "up" : "down")
            }
          >
            {accuracy == null
              ? "—"
              : `${accuracy >= 0 ? "+" : ""}${accuracy.toFixed(1)}%`}
          </div>
          <div className="s">
            {accuracy == null
              ? "scored when this cycle resolves"
              : "excess return vs S&P 500"}
          </div>
        </div>
        <div className="vstat">
          <div className="k">Your return</div>
          <div
            className={
              "v tnum " + (position.returnPct >= 0 ? "up" : "down")
            }
          >
            {position.returnPct >= 0 ? "+" : ""}
            {position.returnPct.toFixed(1)}%
          </div>
          <div className="s">on your deposited capital</div>
        </div>
        <div className="vstat">
          <div className="k">Capital at work</div>
          <div className="v tnum">
            ${Math.round(position.navUsd).toLocaleString()}
          </div>
          <div className="s">
            {position.shares.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}{" "}
            shares
          </div>
        </div>
        <div className="vstat">
          <div className="k">Peer avg accuracy</div>
          <div
            className={
              "v tnum " + (PEER_AVG_ACCURACY_PCT >= 0 ? "up" : "down")
            }
          >
            {PEER_AVG_ACCURACY_PCT >= 0 ? "+" : ""}
            {PEER_AVG_ACCURACY_PCT.toFixed(1)}%
          </div>
          <div className="s">avg alpha across {fundStats.agents} agents</div>
        </div>
      </div>

      <div className="vote-grid">
        <div>
          <div className="listhdr">
            <span className="t">Allocate your basket</span>
            <span className={"total" + (rounded >= 100 ? " full" : "")}>
              Total <b>{rounded}%</b> / 100%
            </span>
          </div>

          <div>
            {alloc.map((a, i) => (
              <div className="vrow" key={a.ticker}>
                <div className="tk">
                  <b>{a.ticker}</b>
                  <s>{COMPANY[a.ticker] ?? a.ticker}</s>
                </div>
                <input
                  className="slider"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={a.pct}
                  onChange={(e) => setPct(i, Number(e.target.value))}
                  aria-label={`${a.ticker} allocation percent`}
                />
                <span className="pct tnum">{a.pct}%</span>
                <span
                  className="del"
                  title="Remove"
                  role="button"
                  tabIndex={0}
                  onClick={() => removeRow(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") removeRow(i);
                  }}
                >
                  <svg
                    className="i"
                    viewBox="0 0 24 24"
                    style={{ width: 16, height: 16 }}
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </span>
              </div>
            ))}
          </div>

          <div className="addbar">
            <span
              className="add"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
            >
              <svg
                className="i"
                viewBox="0 0 24 24"
                style={{ width: 16, height: 16 }}
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add stock
            </span>
            <div
              className={"menu" + (menuOpen ? " open" : "")}
              onClick={(e) => e.stopPropagation()}
            >
              {available.length === 0 ? (
                <div className="empty">All stocks added</div>
              ) : (
                available.map((t) => (
                  <div key={t} onClick={() => addTicker(t)}>
                    <b style={{ fontFamily: "Outfit" }}>{t}</b>
                    <s>{COMPANY[t] ?? t}</s>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            className={"submit" + (submitted ? " done" : "")}
            disabled={!canSubmit}
            onClick={onSubmit}
          >
            {resolved
              ? "Cycle locked"
              : submitted
                ? "Update vote ✓"
                : "Submit vote"}
          </button>

          {!isVerified && (
            <div className="subhint">
              <Link href="/">Join the fund</Link> to verify before voting.
            </div>
          )}

          {submitted && (
            <div className="confirm">
              <b>Vote recorded.</b> This cycle closes in {fmtClock(secondsLeft)}.
            </div>
          )}

          {submitted && !resolved && (
            <div className="demobar">
              <button
                className="demobtn"
                onClick={onResolve}
                title="Demo shortcut (Shift+R)"
              >
                Resolve cycle now (demo)
              </button>
            </div>
          )}

          {resolved && (
            <>
              <div className="resolved">
                Cycle resolved — accuracy posted.
              </div>
              <div className="demobar">
                <button className="demobtn" onClick={onNewCycle}>
                  Start a new cycle → vote again
                </button>
              </div>
            </>
          )}
        </div>

        <div className="card shine">
          <div className="ch">
            <span className="ci">
              <svg className="i" viewBox="0 0 24 24">
                <path d="M15 7a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2h0a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2" />
                <circle cx="7.5" cy="15.5" r="4.5" />
                <path d="m10.5 12.5 6-6" />
              </svg>
            </span>
            <div>
              <h3>Vote via API</h3>
              <div className="csub">Let a bot cast your vote: same power, same path.</div>
            </div>
          </div>

          {!apiActive ? (
            <>
              <div className="gen primary" role="button" tabIndex={0} onClick={generateKeys}>
                {genLabel}
              </div>
              <div className="note">
                Generate a key, then POST your basket to{" "}
                <code style={{ color: "var(--teal)" }}>/api/agent/vote</code>. Vote-only,
                no withdrawals. Revoke anytime in{" "}
                <Link href="/settings" style={{ color: "var(--teal)" }}>
                  Settings
                </Link>
                .
              </div>
            </>
          ) : (
            <>
              <div className="keyl">Secret key</div>
              <div className="key">
                <code className={revealed ? "" : "masked"}>
                  {revealed && secret ? secret : maskSecret(secret)}
                </code>
                <button onClick={copySecret}>Copy</button>
                <button onClick={() => setRevealed((r) => !r)}>
                  {revealed ? "Hide" : "Show"}
                </button>
              </div>
              <div className="note">
                Save it now. The key is shown once and cannot be retrieved later.
              </div>

              {apiNote && (
                <div
                  className="confirm"
                  style={{ marginTop: 10 }}
                >
                  ✓ {apiNote}, applied to your basket above.
                </div>
              )}
              <div className="note">
                Live endpoints: <code>/cycle</code> · <code>/universe</code> ·{" "}
                <code>/me</code> · <code>/vote</code>. Revoke in{" "}
                <Link href="/settings" style={{ color: "var(--teal)" }}>
                  Settings
                </Link>
                .
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
