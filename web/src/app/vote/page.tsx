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
  useFundActions,
  type Pick,
} from "@/lib/data";
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
  const [secret, setSecret] = useState("cfsk_a93Fb2L8qZ4tR7nX1eW0pV6");
  const [revealed, setRevealed] = useState(false);
  const [genLabel, setGenLabel] = useState("Generate API key");
  const [apiActive, setApiActive] = useState(false); // true once a real key is minted
  const [origin, setOrigin] = useState("");
  const [apiNote, setApiNote] = useState<string | null>(null);
  const lastApiVoteRef = useRef<number | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const copySecret = useCallback(() => {
    if (navigator.clipboard) navigator.clipboard.writeText(secret);
  }, [secret]);

  async function generateKeys() {
    setGenLabel("Minting…");
    try {
      const res = await fetch("/api/agent/keys", { method: "POST" });
      const data = (await res.json()) as { keyId: string; secret: string };
      setSecret(data.secret);
      setRevealed(true);
      setApiActive(true);
      lastApiVoteRef.current = null;
      setGenLabel("Key generated ✓");
    } catch {
      setGenLabel("Generation failed — retry");
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

  const MASK = "•".repeat(28);

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
                Cycle resolved — accuracy posted, claim available on Overview.
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
            <h3>API keys</h3>
          </div>
          <p>
            Connect a bot or agent to vote with your power programmatically
            &mdash; the same allocation a human casts. Generate a key, then POST
            to <code style={{ color: "var(--teal)" }}>/api/agent/vote</code>.
          </p>
          <div className="keyl">Secret key</div>
          <div className="key">
            <code>{revealed ? secret : MASK}</code>
            <button onClick={copySecret}>COPY</button>
            <button onClick={() => setRevealed((r) => !r)}>
              {revealed ? "HIDE" : "SHOW"}
            </button>
          </div>
          <div className="gen" role="button" tabIndex={0} onClick={generateKeys}>
            {genLabel}
          </div>

          {apiActive && (
            <>
              <div className="keyl" style={{ marginTop: 14 }}>
                Place a vote (live)
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(0,0,0,.28)",
                  border: "1px solid var(--hair)",
                  font: "500 11px/1.55 ui-monospace,Menlo,monospace",
                  color: "var(--muted)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
{`curl -X POST ${origin}/api/agent/vote \\
  -H "Authorization: Bearer ${secret}" \\
  -H "Content-Type: application/json" \\
  -d '{"picks":[{"ticker":"NVDA","pct":60},{"ticker":"MSFT","pct":40}]}'`}
              </pre>
              {apiNote && (
                <div
                  className="confirm"
                  style={{ marginTop: 10 }}
                >
                  ✓ {apiNote} — applied to your basket above.
                </div>
              )}
            </>
          )}

          <div className="note">
            {apiActive
              ? "Key is live — endpoints: /api/agent/cycle · /universe · /me · /vote. "
              : "Shown once at generation. "}
            Permissions (vote-only, no withdrawals) and revocation live in{" "}
            <Link href="/settings" style={{ color: "var(--teal)" }}>
              Settings
            </Link>
            .
          </div>
        </div>
      </div>
    </div>
  );
}
