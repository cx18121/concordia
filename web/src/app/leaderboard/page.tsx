"use client";

// Leaderboard — ranked members by voting power (Track B, Task B6).
//
// Markup + helper CSS are ported from redesign/mockups/stitch-leaderboard.html.
// Rows bind to useLeaderboardRace() (mock seam): name / strategy / capital / accuracy /
// votingPowerPct come from the agent engine's 12-week replay. In Demo mode the board PLAYS
// that replay as a race — rows reorder (FLIP-animated) as the small-skilled agent overtakes
// the big-capital one, cycle by cycle. Live mode shows the on-chain leaderboard, static.

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { useLeaderboardRace } from "@/lib/data";
import "@/styles/leaderboard.css";

// Purely cosmetic per-rank avatar/bar colors. kind / strategy / capital now come from
// useLeaderboard() (the agent engine's replay), not from here.
const ROW_COLORS = [
  { accent: "bg-teal/20 border-teal/40 text-teal", bar: "bg-teal shadow-[0_0_8px_rgba(45,212,191,0.5)]" },
  { accent: "bg-indigo-500/20 border-indigo-500/40 text-indigo-400", bar: "bg-white/40" },
  { accent: "bg-orange-500/20 border-orange-500/40 text-orange-400", bar: "bg-white/40" },
  { accent: "bg-red-500/20 border-red-500/40 text-red-400", bar: "bg-white/40" },
  { accent: "bg-emerald-500/20 border-emerald-500/40 text-emerald-400", bar: "bg-white/40" },
  { accent: "bg-sky-500/20 border-sky-500/40 text-sky-400", bar: "bg-white/40" },
] as const;

const fmtCapital = (c: number) => (c > 0 ? `$${c.toLocaleString()}` : "—");

function initials(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9. ]/g, "");
  const parts = clean.split(/[ .]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

export default function LeaderboardPage() {
  const { rows, cycle, total } = useLeaderboardRace();
  const top = rows[0];
  const second = rows[1];

  // FLIP: animate rows to their new position whenever the race reorders them. Keyed by name
  // (stable identity) so React keeps the DOM node and we can slide it from old → new spot.
  const rowEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevTop = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    rowEls.current.forEach((el, name) => {
      const now = el.offsetTop;
      const was = prevTop.current.get(name);
      if (was != null && was !== now) {
        el.style.transition = "none";
        el.style.transform = `translateY(${was - now}px)`;
        requestAnimationFrame(() => {
          el.style.transition = "transform 600ms cubic-bezier(0.2,0.8,0.2,1)";
          el.style.transform = "";
        });
      }
      prevTop.current.set(name, now);
    });
  }, [rows]);

  return (
    <main className="max-w-[1140px] mx-auto pt-32 pb-20 px-6 relative z-10">
      {/* Header Section */}
      <header className="mb-12 text-center md:text-left">
        <h1 className="font-display text-5xl md:text-6xl text-text-primary tracking-tight">Leaderboard</h1>
        {total > 0 && (
          <div className="mt-4 inline-flex items-center gap-2 text-text-muted text-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-teal opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
            </span>
            Replaying the agents&rsquo; 12 weeks — cycle{" "}
            <span className="text-text-primary font-semibold tabular-nums">{cycle}</span>/{total}.{" "}
            <span className="text-text-subtle">Watch skill out-vote capital.</span>
          </div>
        )}
      </header>
      {/* Your standing — personal rank + accuracy, ported from the account card. */}
      <section className="mb-16 flex justify-center md:justify-start">
        <Link
          href="/account"
          className="glass glass-border shine rounded-xl p-6 flex items-start gap-5 w-full max-w-md group hover:-translate-y-1 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(45,212,191,0.1)]"
        >
          <div className="w-12 h-12 flex-none rounded-lg bg-teal/10 border border-teal/20 flex items-center justify-center text-teal">
            <span className="material-symbols-outlined">emoji_events</span>
          </div>
          <div>
            <h4 className="text-text-primary font-display text-lg leading-tight">Your standing</h4>
            <p className="text-[11px] text-text-subtle uppercase tracking-widest mt-1 mb-2">Rank #42 of 1,284</p>
            <p className="text-xs text-text-muted leading-relaxed">
              Compare your portfolio accuracy against the community. Earn badges for top-tier forecasting.
            </p>
          </div>
        </Link>
      </section>
      {/* Comparison Block (Free on Background) — bound to top two rows */}
      {top && second && (
        <section className="mb-20 grid grid-cols-1 md:grid-cols-11 items-center gap-8 px-4">
          <div className="md:col-span-4 text-center md:text-right group cursor-default">
            <p className="text-text-subtle text-[11px] uppercase tracking-[0.1em] mb-2">Top Ranked</p>
            <h3 className="font-display text-2xl text-text-primary mb-1">{top.name}</h3>
            <p className="text-text-muted text-sm font-body">
              {top.kind} ·{" "}
              <span className={top.accuracy >= 0 ? "text-gain" : "text-loss"}>acc {top.accuracy.toFixed(1)}%</span> · VP{" "}
              {top.votingPowerPct.toFixed(1)}% ·{" "}
              <span className="tabular-nums">{fmtCapital(top.capital)}</span>
            </p>
          </div>
          <div className="md:col-span-3 flex flex-col items-center">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 bg-teal/20 blur-2xl rounded-full scale-150" />
              <div className="relative glass glass-border w-14 h-14 rounded-full flex items-center justify-center z-10">
                <span className="material-symbols-outlined text-teal text-3xl">trending_up</span>
              </div>
            </div>
            <span className="mt-4 text-text-subtle text-[11px] uppercase tracking-widest font-bold">Out-votes</span>
          </div>
          <div className="md:col-span-4 text-center md:text-left group cursor-default">
            <p className="text-text-subtle text-[11px] uppercase tracking-[0.1em] mb-2">Runner-up</p>
            <h3 className="font-display text-2xl text-text-primary mb-1">{second.name}</h3>
            <p className="text-text-muted text-sm font-body">
              {second.kind} ·{" "}
              <span className={second.accuracy >= 0 ? "text-gain" : "text-loss"}>acc {second.accuracy.toFixed(1)}%</span> · VP{" "}
              {second.votingPowerPct.toFixed(1)}% ·{" "}
              <span className="tabular-nums">{fmtCapital(second.capital)}</span>
            </p>
          </div>
        </section>
      )}
      {/* Ranked List (Open) */}
      <section className="w-full">
        {/* Table Header */}
        <div className="grid grid-cols-12 px-6 py-4 border-b border-white/10 text-text-subtle text-[11px] uppercase tracking-widest font-bold">
          <div className="col-span-1">#</div>
          <div className="col-span-5 md:col-span-4">Member</div>
          <div className="col-span-2 text-right">Accuracy</div>
          <div className="hidden md:block col-span-2 text-right">Capital</div>
          <div className="col-span-4 md:col-span-3 text-right">Voting Power</div>
        </div>
        {/* List Rows — bound to useLeaderboard() */}
        <div className="divide-y divide-white/5">
          {rows.map((row, i) => {
            const c = ROW_COLORS[i] ?? ROW_COLORS[ROW_COLORS.length - 1];
            const up = row.accuracy >= 0;
            return (
              <div
                key={row.name}
                ref={(el) => {
                  if (el) rowEls.current.set(row.name, el);
                  else rowEls.current.delete(row.name);
                }}
                className="grid grid-cols-12 items-center px-6 py-6 list-row"
              >
                <div className="col-span-1 font-display text-xl text-text-muted tabular-nums">{row.rank}</div>
                <div className="col-span-5 md:col-span-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full border flex items-center justify-center font-display font-bold ${c.accent}`}>
                    {initials(row.name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-body font-semibold text-text-primary">{row.name}</span>
                      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[9px] uppercase tracking-tighter text-text-muted">
                        {row.kind}
                      </span>
                    </div>
                    <span className="text-[11px] text-text-subtle">{row.strategy}</span>
                  </div>
                </div>
                <div className="col-span-2 text-right">
                  <span className={`${up ? "text-gain" : "text-loss"} font-display text-lg tabular-nums flex items-center justify-end gap-1`}>
                    <span className="material-symbols-outlined text-sm">{up ? "arrow_drop_up" : "arrow_drop_down"}</span>
                    {Math.abs(row.accuracy).toFixed(1)}%
                  </span>
                </div>
                <div className="hidden md:block col-span-2 text-right font-display text-lg text-text-primary tabular-nums">
                  {fmtCapital(row.capital)}
                </div>
                <div className="col-span-4 md:col-span-3 flex flex-col items-end">
                  <span className={`font-display text-xl tabular-nums ${i === 0 ? "text-teal" : "text-text-primary"}`}>
                    {row.votingPowerPct.toFixed(1)}%
                  </span>
                  <div className="w-24 h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                    <div
                      className={`h-full ${c.bar} transition-[width] duration-500`}
                      style={{ width: `${Math.min(row.votingPowerPct * 3, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
