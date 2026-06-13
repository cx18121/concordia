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

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

function randId(len: number, ch: string): string {
  let out = "";
  for (let i = 0; i < len; i++) out += ch[Math.floor(Math.random() * ch.length)];
  return out;
}

export default function VotePage() {
  const { isVerified } = useAuth();
  const { id, secondsLeft } = useCycle();
  const votingPower = useVotingPower();
  const prices = usePrices(); // bound so the universe reflects live tickers (B7).
  const { castVote, resolveCycle } = useFundActions();

  // --- Allocation form state -------------------------------------------------
  const [alloc, setAlloc] = useState<Pick[]>(SEED_ALLOC);
  const [menuOpen, setMenuOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resolved, setResolved] = useState(false);

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

  // Close the "Add stock" menu on any outside click (mirrors the mock).
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = () => setMenuOpen(false);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuOpen]);

  // Enabled only when verified and the basket sums to exactly 100%.
  const canSubmit = isVerified && rounded === 100 && !submitted;

  async function onSubmit() {
    if (!canSubmit) return;
    await castVote(alloc);
    setSubmitted(true);
  }

  async function onResolve() {
    await resolveCycle();
    setResolved(true);
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

  // --- API keys card (cosmetic; not on the demo path) ------------------------
  const [keyId, setKeyId] = useState("CK7XQ2M9A4PL3VNB1DZE");
  const [secret, setSecret] = useState("cfsk_a93Fb2L8qZ4tR7nX1eW0pV6");
  const [revealed, setRevealed] = useState(false);
  const [genLabel, setGenLabel] = useState("Generate new keys");

  const copyKey = useCallback(() => {
    if (navigator.clipboard) navigator.clipboard.writeText(keyId);
  }, [keyId]);

  function generateKeys() {
    setKeyId(randId(20, "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"));
    setSecret("cfsk_" + randId(24, "abcdefghijkmnpqrstuvwxyz0123456789"));
    setRevealed(true);
    setGenLabel("New keys generated ✓");
    window.setTimeout(() => setGenLabel("Generate new keys"), 1600);
  }

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

      <div className="grid">
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
            {submitted ? "Vote submitted ✓" : "Submit vote"}
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
            <div className="resolved">
              Cycle resolved — accuracy posted, claim available on Overview.
            </div>
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
            &mdash; the same on-chain path you use. Alpaca-style key + secret.
          </p>
          <div className="keyl">Key ID</div>
          <div className="key">
            <code>{keyId}</code>
            <button onClick={copyKey}>COPY</button>
          </div>
          <div className="keyl">Secret key</div>
          <div className="key">
            <code>{revealed ? secret : MASK}</code>
            <button onClick={() => setRevealed((r) => !r)}>
              {revealed ? "HIDE" : "SHOW"}
            </button>
          </div>
          <div className="gen" role="button" tabIndex={0} onClick={generateKeys}>
            {genLabel}
          </div>
          <div className="note">
            Shown once at generation. Permissions (vote-only, no withdrawals) and
            revocation live in{" "}
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
