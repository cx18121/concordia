"use client";

// Welcome — the public pre-join page (Track B membership gate).
//
// Shown only to people who have NOT joined the fund. It presents whole-fund
// value + statistics (NO graph) so a visitor can size up the fund before
// committing, then routes them into /join. AppShell hides the nav for
// non-members and makes this page inaccessible once they hold a position, so
// this component never renders for a member.
//
// Numbers come from the same mock->live data seam every other page binds to
// (useFundStats, useCycle). The hero + numeric cards reuse the shared count-up.

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFundStats, enterDemo } from "@/lib/data";
import { setMode } from "@/lib/mode";
import { countUp } from "@/lib/countUp";
import NeuralBackground from "@/components/NeuralBackground";
import "@/styles/welcome.css";

// One card shape with optional fields so the heterogeneous list is a single
// type (not a union) — keeps property access on every card type-safe.
type StatCard = {
  label: string;
  ico: ReactNode;
  value: string; // display value (count-up animates toward `count`)
  count?: number; // present => animated via count-up
  dec?: number;
  suffix?: string;
  accent?: boolean; // teal number (highlight)
};

export default function Welcome() {
  const router = useRouter();
  const stats = useFundStats();
  const rootRef = useRef<HTMLDivElement>(null);

  // How much the fund is beating the S&P 500 by, over the same window.
  const vsSp = Math.round((stats.allTimeReturnPct - stats.spReturnPct) * 10) / 10;

  // Animate every data-count number once on mount (same pattern as shell.js).
  useEffect(() => {
    rootRef.current
      ?.querySelectorAll<HTMLElement>("[data-count]")
      .forEach((el) => countUp(el));
  }, []);

  // Three stats (no graph): members · S&P outperformance · member accuracy.
  const cards: StatCard[] = [
    {
      label: "Members",
      ico: (
        <svg viewBox="0 0 24 24">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      value: String(stats.members),
      count: stats.members,
      dec: 0,
    },
    {
      label: "Beating S&P 500",
      accent: true,
      ico: (
        <svg viewBox="0 0 24 24">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      ),
      value: `+${vsSp}%`,
      count: vsSp,
      dec: 1,
      suffix: "%",
    },
    {
      label: "Member accuracy",
      ico: (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      ),
      value: `${stats.avgAccuracy}%`,
      count: stats.avgAccuracy,
      dec: 1,
      suffix: "%",
    },
  ];

  return (
    <div className="wl-page" ref={rootRef}>
      {/* Animated neural-net behind everything; content sits in front (z-index). */}
      <NeuralBackground />

      {/* Hero — total fund value, no chart */}
      <div className="wl-hero wl-rise">
        <span className="wl-brand">
          <span className="wl-brand-mark">
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
          </span>
          <span className="wl-brand-name">Concordia</span>
        </span>
        <span className="wl-value" data-count={stats.aumUsd} data-dec="0">
          ${stats.aumUsd.toLocaleString()}
        </span>
        <span className="wl-chg">
          ▲ +{stats.allTimeReturnPct}% <span className="muted">· all-time</span>
        </span>
      </div>

      {/* Stat grid — glass cards, staggered entrance */}
      <div className="wl-grid">
        {cards.map((c, i) => (
          <div
            key={c.label}
            className="wl-card wl-rise"
            style={{ animationDelay: `${0.1 + i * 0.06}s` }}
          >
            <span className="wl-ico">{c.ico}</span>
            <div className={`wl-k${c.accent ? " accent" : ""}`}>
              {c.count != null ? (
                <span
                  data-count={c.count}
                  data-dec={c.dec ?? 0}
                  data-suffix={c.suffix ?? ""}
                >
                  {c.value}
                </span>
              ) : (
                c.value
              )}
            </div>
            <div className="wl-l">{c.label}</div>
          </div>
        ))}
      </div>

      {/* CTAs — explore the demo (no auth) or join the live fund (World ID + deposit) */}
      <div className="wl-actions wl-rise" style={{ animationDelay: "0.5s" }}>
        <div className="wl-btns">
          <button
            className="wl-cta"
            onClick={() => {
              setMode("mock");
              enterDemo();
              router.push("/");
            }}
          >
            <svg viewBox="0 0 16 16">
              <polygon points="5,4 12,8 5,12" fill="currentColor" stroke="none" />
            </svg>
            View demo
          </button>
          <button
            className="wl-cta wl-cta-ghost"
            onClick={() => {
              setMode("live");
              router.push("/join");
            }}
          >
            <svg viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6" />
              <line x1="8" y1="5" x2="8" y2="11" />
              <line x1="5" y1="8" x2="11" y2="8" />
            </svg>
            Join live fund
          </button>
        </div>
        <span className="wl-sub">
          Demo jumps straight in · live verifies with World ID, deposits demo USDC, then votes
        </span>
      </div>
    </div>
  );
}
