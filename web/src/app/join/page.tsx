"use client";

// Join — the mock onboarding card (Track B, Task B6b).
//
// Markup + CSS are ported from redesign/mockups/sign-in.html. The mockup faked
// step advancement with setTimeout; here the three steps drive off the real
// mock seam:
//   Step 1 Connect -> useAuth().login()
//   Step 2 Verify  -> useAuth().verify()
//   Step 3 Fund    -> getDemoUSDC() then deposit(1000)  (funds the position)
// deposit() mutates the shared mock position, so Overview's "Your position"
// chip populates once funding completes. The spinners/success tick are kept
// for demo polish; the mock calls resolve instantly so a short artificial
// delay carries the transition.
//
// Global chrome (nav, .amb background) lives in layout.tsx, so this renders
// only the .page > .card.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { useIsMock } from "@/lib/mode";
import { useFundActions } from "@/lib/data";
import NeuralBackground from "@/components/NeuralBackground";
import "@/styles/join.css";

const DEMO_USDC = 1000;
// Mock calls resolve instantly; a short pause carries the mockup's transition.
const PAUSE = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Step = 1 | 2 | 3 | "done";
type Mode = "email" | "wallet";

// Short display for the demo address (auth.address is a full 0x…).
function shortAddr(addr: string | null): string {
  if (!addr) return "your wallet";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function JoinPage() {
  const router = useRouter();
  const auth = useAuth();
  const isMock = useIsMock();
  const { getDemoUSDC, deposit } = useFundActions();

  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [loginStarted, setLoginStarted] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false); // drives the success tick
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);

  // "Signed in as" — email if used, else the short address.
  const signedAs = email || shortAddr(auth.address);

  // Back: step 1 leaves to Overview; later steps walk back through the flow.
  function handleBack() {
    if (step === 1) router.push("/");
    else if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  }

  // ── Step 1: Connect (email or wallet) ──────────────────────────────
  // Advance to Verify only once we're really connected — not on a timer. login()
  // resolves when Dynamic's modal closes; if the user cancels, isConnected stays
  // false and we hold on step 1. (Mock is always connected, so a click advances.)
  useEffect(() => {
    if (loginStarted && auth.isConnected && step === 1) {
      setLoginStarted(false);
      setStep(2);
    }
  }, [loginStarted, auth.isConnected, step]);

  async function connect() {
    if (connecting) return;
    setConnecting(true);
    setLoginStarted(true);
    try {
      await auth.login();
    } finally {
      setConnecting(false);
    }
  }

  async function handleEmail() {
    if (!email.includes("@")) return;
    await connect();
  }

  // ── Step 2: Verify with World ID ───────────────────────────────────
  async function handleVerify() {
    if (verifying) return;
    setVerifying(true);
    try {
      const ok = await auth.verify();
      if (!ok) return;
      setVerified(true); // show the success tick briefly
      await sleep(PAUSE);
      setStep(3);
    } finally {
      setVerifying(false);
    }
  }

  // ── Step 3: Claim demo USDC (claim also funds the position) ─────────
  async function handleFund() {
    if (funding) return;
    setFunding(true);
    setFundError(null);
    try {
      await getDemoUSDC();
      await deposit(DEMO_USDC);
      await sleep(PAUSE);
      setStep("done");
    } catch (e) {
      // Surface the failure instead of silently dropping back to the button.
      setFundError(e instanceof Error ? e.message : "Funding failed. Please try again.");
    } finally {
      setFunding(false);
    }
  }

  const spinner = (
    <svg
      className="spin"
      viewBox="0 0 16 16"
      style={{ width: 15, height: 15, fill: "none", stroke: "#04201C", strokeWidth: 2, strokeLinecap: "round" }}
    >
      <circle cx="8" cy="8" r="5" strokeDasharray="25" strokeDashoffset="10" />
    </svg>
  );

  // Step indicator: dots/labels/lines reflect done/active per the current step.
  const stepNum = step === "done" ? 4 : step;
  const dotClass = (i: number) =>
    "step-dot" + (i < stepNum ? " done" : i === stepNum ? " active" : "");
  const lblClass = (i: number) =>
    "step-label" + (i < stepNum ? " done" : i === stepNum ? " active" : "");
  const lineClass = (i: number) => "step-line" + (i < stepNum ? " done" : "");
  const doneCheck = (
    <svg
      style={{ width: 13, height: 13, fill: "none", stroke: "#04201C", strokeWidth: 2.8, strokeLinecap: "round", strokeLinejoin: "round" }}
      viewBox="0 0 14 14"
    >
      <polyline points="2.5,7.5 5.5,10.5 11.5,4" />
    </svg>
  );

  return (
    <div className="page">
      <NeuralBackground />
      <div className="card">
        {/* Back: to Overview from step 1, else one step back. Hidden when done. */}
        {step !== "done" && (
          <button className="join-back" onClick={handleBack}>
            <svg viewBox="0 0 16 16">
              <line x1="13" y1="8" x2="3" y2="8" />
              <polyline points="7,4 3,8 7,12" />
            </svg>
            {step === 1 ? "Back to Overview" : "Back"}
          </button>
        )}

        {/* Logo */}
        <div className="logo-row">
          <div className="logo-mark">
            <svg viewBox="0 0 24 24">
              <g style={{ strokeWidth: 1.4 }}>
                <line x1="12" y1="12" x2="12" y2="4.5" />
                <line x1="12" y1="12" x2="18.5" y2="8.25" />
                <line x1="12" y1="12" x2="18.5" y2="15.75" />
                <line x1="12" y1="12" x2="12" y2="19.5" />
                <line x1="12" y1="12" x2="5.5" y2="15.75" />
                <line x1="12" y1="12" x2="5.5" y2="8.25" />
                <polyline points="18.5,8.25 12,4.5 5.5,8.25 5.5,15.75 12,19.5 18.5,15.75" fill="none" />
              </g>
              <g style={{ fill: "#04201C", stroke: "none" }}>
                <circle cx="12" cy="4.5" r="2.3" />
                <circle cx="18.5" cy="8.25" r="2.3" />
                <circle cx="18.5" cy="15.75" r="2.3" />
                <circle cx="12" cy="19.5" r="2.3" />
                <circle cx="5.5" cy="15.75" r="2.3" />
                <circle cx="5.5" cy="8.25" r="2.3" />
                <circle cx="12" cy="12" r="3.4" />
              </g>
            </svg>
          </div>
          <div className="logo-text">
            <h1>Concordia</h1>
            <p>Hedge Fund DAO</p>
          </div>
        </div>

        {/* Step indicator (hidden on the done screen) */}
        {step !== "done" && (
          <div className="steps">
            <div className="step-item">
              <div className={dotClass(1)}>{1 < stepNum ? doneCheck : 1}</div>
              <span className={lblClass(1)}>Connect</span>
              <div className={lineClass(1)} />
            </div>
            <div className="step-item">
              <div className={dotClass(2)}>{2 < stepNum ? doneCheck : 2}</div>
              <span className={lblClass(2)}>Verify</span>
              <div className={lineClass(2)} />
            </div>
            <div className="step-item" style={{ flex: 0 }}>
              <div className={dotClass(3)}>{3 < stepNum ? doneCheck : 3}</div>
              <span className={lblClass(3)}>Fund</span>
            </div>
          </div>
        )}

        {/* ── STEP 1: CONNECT ── */}
        {step === 1 && (
          <div>
            <div className="section-title">Sign in to Concordia</div>
            <div className="section-sub">
              Use email for a gas-free embedded wallet, or connect an existing
              wallet.
            </div>

            {/* Toggle */}
            <div className="toggle">
              <button
                className={"toggle-btn" + (mode === "email" ? " active" : "")}
                onClick={() => setMode("email")}
              >
                <svg viewBox="0 0 16 16">
                  <rect x="2" y="4" width="12" height="9" rx="1.5" />
                  <polyline points="2,4 8,9 14,4" />
                </svg>
                Email login
              </button>
              <button
                className={"toggle-btn" + (mode === "wallet" ? " active" : "")}
                onClick={() => setMode("wallet")}
              >
                <svg viewBox="0 0 16 16">
                  <rect x="1" y="4" width="14" height="10" rx="1.5" />
                  <path d="M11 9a1 1 0 1 0 2 0 1 1 0 0 0-2 0z" fill="currentColor" stroke="none" />
                  <path d="M1 7h14" />
                </svg>
                Wallet
              </button>
            </div>

            {/* Email mode. Live mode hands email entry to Dynamic's own modal
                (it collects the email + sends the code) so there's no second
                prompt; mock keeps the inline input for the demo. */}
            {mode === "email" && (
              <div>
                {isMock ? (
                  <>
                    <label className="lbl">Email address</label>
                    <div className="input-row">
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEmail();
                        }}
                      />
                      <button
                        className="btn btn-teal"
                        onClick={handleEmail}
                        disabled={connecting}
                      >
                        {connecting ? (
                          spinner
                        ) : (
                          <svg viewBox="0 0 16 16">
                            <line x1="3" y1="8" x2="13" y2="8" />
                            <polyline points="9,4 13,8 9,12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    className="btn btn-teal btn-full"
                    onClick={connect}
                    disabled={connecting}
                  >
                    {connecting ? (
                      <>{spinner} Connecting…</>
                    ) : (
                      "Continue with email"
                    )}
                  </button>
                )}
                <div className="hint">
                  Powered by Dynamic: an embedded wallet, no browser extension
                  needed.
                </div>
              </div>
            )}

            {/* Wallet mode */}
            {mode === "wallet" && (
              <div>
                <div className="wallet-list">
                  {[
                    { name: "MetaMask", icon: "🦊" },
                    { name: "Coinbase Wallet", icon: "🔵" },
                    { name: "WalletConnect", icon: "🔗" },
                  ].map((w) => (
                    <button
                      key={w.name}
                      className="wallet-opt"
                      onClick={connect}
                      disabled={connecting}
                    >
                      <div className="wallet-icon">{w.icon}</div>
                      {w.name}
                      <div className="wallet-arrow">
                        <svg viewBox="0 0 15 15">
                          <line x1="3" y1="7.5" x2="12" y2="7.5" />
                          <polyline points="8.5,4 12,7.5 8.5,11" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Returning live user: Dynamic kept the session, so a click would walk
                straight through Connect. Offer a reset so the flow can be demoed fresh. */}
            {!isMock && auth.isConnected && (
              <div className="hint" style={{ marginTop: 14, textAlign: "center" }}>
                Connected as {shortAddr(auth.address)} ·{" "}
                <button
                  type="button"
                  onClick={() => auth.logout()}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "#ff8d8d",
                    cursor: "pointer",
                    font: "inherit",
                    textDecoration: "underline",
                  }}
                >
                  Disconnect to use another account
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: WORLD ID ── */}
        {step === 2 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 13, background: "linear-gradient(135deg,#1a1a2e,#16213e)", display: "grid", placeItems: "center", border: "1px solid rgba(255,255,255,.1)", flex: "none" }}>
                <svg style={{ width: 22, height: 22, fill: "none", stroke: "#fff", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }} viewBox="0 0 22 22">
                  <circle cx="11" cy="11" r="9" />
                  <ellipse cx="11" cy="11" rx="4" ry="9" />
                  <line x1="2" y1="11" x2="20" y2="11" />
                </svg>
              </div>
              <div>
                <div className="section-title" style={{ marginBottom: 2 }}>
                  Verify with World ID
                </div>
                <div style={{ font: "400 12.5px/1 Inter", color: "var(--muted)" }}>
                  One human, one account
                </div>
              </div>
            </div>

            <div className="info-box">
              <div className="info-box-title">
                <svg viewBox="0 0 14 14">
                  <path d="M7 1a6 6 0 1 0 0 12A6 6 0 0 0 7 1z" />
                  <line x1="7" y1="6" x2="7" y2="10" />
                  <circle cx="7" cy="4" r=".5" fill="currentColor" stroke="none" />
                </svg>
                Why we require this
              </div>
              <p>
                Voting power = 50% capital + 50% accuracy. Without sybil
                resistance, one person could create many wallets to game accuracy
                scores. World ID ensures one person = one account.
              </p>
            </div>

            <div className="verify-box">
              {verified ? (
                <>
                  <div className="success-icon">
                    <svg viewBox="0 0 24 24">
                      <polyline points="4,13 9,18 20,7" />
                    </svg>
                  </div>
                  <div style={{ font: "700 15px/1 Inter", color: "var(--green)", marginTop: 4 }}>
                    Verified!
                  </div>
                </>
              ) : (
                <>
                  <div className="verify-signed">
                    Signed in as <strong>{signedAs}</strong>
                  </div>
                  <div className="world-logo">
                    <svg viewBox="0 0 22 22">
                      <circle cx="11" cy="11" r="9" />
                      <ellipse cx="11" cy="11" rx="4" ry="9" />
                      <line x1="2" y1="11" x2="20" y2="11" />
                    </svg>
                  </div>
                  <button
                    className="btn btn-teal btn-full"
                    onClick={handleVerify}
                    disabled={verifying}
                  >
                    {verifying ? (
                      <>
                        {spinner} Verifying…
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 16 16">
                          <circle cx="8" cy="8" r="6" />
                          <ellipse cx="8" cy="8" rx="3" ry="6" />
                          <line x1="2" y1="8" x2="14" y2="8" />
                        </svg>
                        Open World App to verify
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
            <div className="foot-note">
              Uses selfieCheckLegacy · proof verified server-side via World ID
              REST API
            </div>
          </div>
        )}

        {/* ── STEP 3: FUND ── */}
        {step === 3 && (
          <div>
            <div className="section-title">Get demo USDC</div>
            <div className="section-sub">
              Your account is verified. Claim free demo USDC to deposit and start
              voting.
            </div>

            <div className="usdc-card">
              <div style={{ font: "400 13px/1 Inter", color: "var(--muted)", marginBottom: 16 }}>
                Available to claim
              </div>
              <div className="usdc-amount">1,000</div>
              <div className="usdc-denom">demo USDC</div>
              <div className="usdc-addr">→ {shortAddr(auth.address)}</div>
            </div>

            <button
              className="btn btn-teal btn-full"
              onClick={handleFund}
              disabled={funding}
            >
              {funding ? (
                <>
                  {spinner} Minting…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="6" />
                    <line x1="8" y1="5" x2="8" y2="11" />
                    <line x1="5" y1="8" x2="11" y2="8" />
                  </svg>
                  Claim 1,000 demo USDC
                </>
              )}
            </button>
            {fundError && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(255,107,107,.1)",
                  border: "1px solid rgba(255,107,107,.3)",
                  color: "#ff8d8d",
                  font: "400 12.5px/1.4 Inter",
                }}
              >
                {fundError}
              </div>
            )}
            <div className="foot-note">
              Gas is sponsored · tokens have no real value
            </div>
          </div>
        )}

        {/* ── DONE ── */}
        {step === "done" && (
          <div className="done-panel">
            <div className="success-icon" style={{ width: 64, height: 64, marginBottom: 18 }}>
              <svg viewBox="0 0 24 24" style={{ width: 30, height: 30 }}>
                <polyline points="4,13 9,18 20,7" />
              </svg>
            </div>
            <h2>You&apos;re in!</h2>
            <p>
              Wallet connected · World ID verified · 1,000 demo USDC claimed.
              <br />
              You&apos;re ready to deposit and vote.
            </p>
            <div className="done-links">
              <Link href="/vote" className="btn btn-teal">
                Go to Vote →
              </Link>
              <Link href="/" className="btn btn-ghost">
                Overview
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
