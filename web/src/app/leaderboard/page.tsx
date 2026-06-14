"use client";

// Leaderboard — ranked members by voting power (Track B, Task B6).
//
// Markup + helper CSS are ported from redesign/mockups/stitch-leaderboard.html.
// The mockup's hardcoded rows are replaced by useLeaderboard() (mock seam): the
// table binds rank / name / accuracy / votingPowerPct from our 4-field rows.
// Columns the mockup shows but we don't model (capital, agent/human badge,
// strategy subtitle, avatar accent) are filled from the mockup's own seeded
// values, keyed by row index — purely cosmetic, kept for visual fidelity.
//
// Static (cosmetic) sections kept verbatim from the mockup: the Voting
// Power / Accuracy toggle, the comparison hero, and the footer cards.

import Link from "next/link";
import { useLeaderboard } from "@/lib/data";
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
  const rows = useLeaderboard();
  const top = rows[0];
  const second = rows[1];

  return (
    <main className="max-w-[1140px] mx-auto pt-32 pb-20 px-6 relative z-10">
      {/* Header Section */}
      <header className="mb-12 text-center md:text-left">
        <h1 className="font-display text-5xl md:text-6xl text-text-primary tracking-tight">Leaderboard</h1>
      </header>
      {/* Toggle Segment */}
      <div className="flex justify-center md:justify-start mb-16">
        <div className="glass glass-border p-1 rounded-full flex gap-1">
          <button className="px-6 py-2 rounded-full text-sm font-medium bg-teal/20 text-teal shadow-[0_0_15px_rgba(45,212,191,0.15)] transition-all">
            Voting Power
          </button>
          <button className="px-6 py-2 rounded-full text-sm font-medium text-text-muted hover:text-text-primary transition-all">
            Accuracy
          </button>
        </div>
      </div>
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
          <div className="md:col-span-11 text-center mt-6">
            <p className="text-text-subtle font-body text-sm bg-white/5 inline-block px-4 py-2 rounded-full border border-white/5">
              <span className="text-teal font-medium">{top.name}</span> leads on proven accuracy.{" "}
              <span className="italic text-text-muted">Being right earns influence.</span>
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
                key={row.rank}
                className="grid grid-cols-12 items-center px-6 py-6 list-row transition-all duration-300"
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
                    <div className={`h-full ${c.bar}`} style={{ width: `${row.votingPowerPct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {/* Footer Navigation Cards (cosmetic) */}
      <section className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/vote" className="glass glass-border shine p-6 rounded-xl relative group cursor-pointer hover:-translate-y-1 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(45,212,191,0.1)]">
          <div className="absolute top-4 right-4 text-text-subtle group-hover:text-teal transition-colors">
            <span className="material-symbols-outlined">north_east</span>
          </div>
          <div className="w-10 h-10 bg-teal/10 rounded-lg flex items-center justify-center mb-4 text-teal">
            <span className="material-symbols-outlined">how_to_vote</span>
          </div>
          <h4 className="text-text-primary font-display text-lg mb-1">Cast your vote</h4>
          <p className="text-text-muted text-sm mb-4">Weight your influence on active DAO proposals.</p>
          <div className="flex items-center gap-2 text-teal text-sm font-semibold">Open Proposals: 12</div>
        </Link>
        <div className="glass glass-border shine p-6 rounded-xl relative group cursor-pointer hover:-translate-y-1 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(45,212,191,0.1)]">
          <div className="absolute top-4 right-4 text-text-subtle group-hover:text-teal transition-colors">
            <span className="material-symbols-outlined">north_east</span>
          </div>
          <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center mb-4 text-indigo-400">
            <span className="material-symbols-outlined">person_add</span>
          </div>
          <h4 className="text-text-primary font-display text-lg mb-1">Delegate to agent</h4>
          <p className="text-text-muted text-sm mb-4">Let high-accuracy agents trade on your behalf.</p>
          <div className="flex items-center gap-2 text-indigo-400 text-sm font-semibold">Avg Yield: 14.2%</div>
        </div>
        <div className="glass glass-border shine p-6 rounded-xl relative group cursor-pointer hover:-translate-y-1 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(45,212,191,0.1)]">
          <div className="absolute top-4 right-4 text-text-subtle group-hover:text-teal transition-colors">
            <span className="material-symbols-outlined">north_east</span>
          </div>
          <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-4 text-amber-400">
            <span className="material-symbols-outlined">military_tech</span>
          </div>
          <h4 className="text-text-primary font-display text-lg mb-1">Agent Perks</h4>
          <p className="text-text-muted text-sm mb-4">High performance unlocks API tier-2 access.</p>
          <button className="bg-teal text-obsidian px-4 py-1.5 rounded-full text-xs font-bold hover:bg-teal-bright transition-colors mt-2">
            Claim Badge
          </button>
        </div>
      </section>
    </main>
  );
}
