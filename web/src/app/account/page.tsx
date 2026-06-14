"use client";

// Account / Portfolio — bound to the live fund model (data.ts). Your position
// value matches the Overview hero (both read usePosition().navUsd); the global
// stats (AUM, NAV/share, S&P, alpha), your %-of-fund, reward earned (your share
// of 20% of alpha), and Deposit all move together through the shared NAV.

import { useState } from "react";
import Link from "next/link";
import PerformanceChart from "@/components/PerformanceChart";
import Holdings from "@/components/Holdings";
import {
  usePosition,
  useAccuracy,
  useRewardEarned,
  useCyclesPlayed,
  useFundTotals,
  useFundStats,
  useFundActions,
} from "@/lib/data";
import "@/styles/account.css";

function fmtUsd(v: number) {
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function fmtAum(v: number) {
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : fmtUsd(v);
}

export default function AccountPage() {
  const position = usePosition();
  const accuracy = useAccuracy();
  const rewardEarned = useRewardEarned();
  const cyclesPlayed = useCyclesPlayed();
  const totals = useFundTotals();
  const { members } = useFundStats();
  const { deposit } = useFundActions();
  const [amount, setAmount] = useState("");
  // Demo epoch lock: deposits are epoch-locked until you "unlock" the epoch
  // (toggleable in the Next Epoch card). Mirrors the on-chain epoch boundary.
  const [epochUnlocked, setEpochUnlocked] = useState(false);

  async function onDeposit() {
    if (!epochUnlocked) return;
    const n = Number(amount.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return;
    await deposit(n);
    setAmount("");
  }

  return (
    <>
      <main className="max-w-[1140px] mx-auto pt-32 pb-20 px-6 relative z-10">
        {/* Global Stats Row */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-0 mb-16 items-center">
          <div className="px-6 border-r border-white/10 last:border-0 py-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-subtle mb-1">Assets Under Mgmt</p>
            <h2 className="font-display text-4xl font-extrabold text-text-primary">{fmtAum(totals.aum)}</h2>
          </div>
          <div className="px-6 border-r border-white/10 last:border-0 py-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-subtle mb-1">NAV / Share</p>
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-4xl font-extrabold text-text-primary">{totals.navPerShare.toFixed(3)}</h2>
              <span className={`text-sm font-semibold ${totals.navPct >= 0 ? "text-gain" : "text-loss"}`}>
                {totals.navPct >= 0 ? "▲" : "▼"} {Math.abs(totals.navPct).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="px-6 border-r border-white/10 last:border-0 py-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-subtle mb-1">S&amp;P Benchmark</p>
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-4xl font-extrabold text-text-primary">{totals.spxIndex.toFixed(3)}</h2>
              <span className={`text-sm font-semibold ${totals.spxPct >= 0 ? "text-gain" : "text-loss"}`}>
                {totals.spxPct >= 0 ? "▲" : "▼"} {Math.abs(totals.spxPct).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="px-6 border-r border-white/10 last:border-0 py-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-subtle mb-1">Alpha vs S&amp;P</p>
            <h2 className={`font-display text-4xl font-extrabold ${totals.alphaPct >= 0 ? "text-teal" : "text-loss"}`}>{fmtPct(totals.alphaPct)}</h2>
          </div>
        </section>
        <PerformanceChart endNav={totals.aum} />
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Your Stake */}
          <div className="lg:col-span-7 flex">
            <div className="glass-card shine rounded-xl p-8 transition-transform hover:translate-y-[-4px] duration-300 w-full flex flex-col">
              <div className="flex justify-between items-start mb-10">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-subtle mb-1">Your Position Value</p>
                  <div className="flex items-baseline gap-3">
                    <h1 className="text-5xl font-display font-extrabold text-text-primary tracking-tight">{fmtUsd(position.navUsd)}</h1>
                    <span className="px-2 py-0.5 rounded bg-teal/10 text-teal text-[10px] font-bold uppercase tracking-wide border border-teal/20">{totals.positionPct.toFixed(1)}% of fund</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-text-subtle cursor-pointer hover:text-text-primary transition-colors">north_east</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
                <div>
                  <p className="text-[10px] text-text-subtle uppercase mb-1">Deposited</p>
                  <p className="text-sm font-semibold">{fmtUsd(position.costUsd)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-subtle uppercase mb-1">Accuracy</p>
                  <p
                    className={`text-sm font-semibold ${
                      accuracy == null ? "text-text-muted" : accuracy >= 0 ? "text-gain" : "text-loss"
                    }`}
                  >
                    {accuracy == null ? "—" : fmtPct(accuracy)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-subtle uppercase mb-1">Cycles played</p>
                  <p className="text-sm font-semibold">{cyclesPlayed}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-subtle uppercase mb-1">Reward earned</p>
                  <p className="text-sm font-semibold text-teal">{fmtUsd(rewardEarned)}</p>
                </div>
              </div>
              <div className="h-px w-full bg-white/10 mb-10 mt-auto" />
              <div className="space-y-6">
                <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Expand Position</h4>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">$</span>
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-8 pr-4 text-text-primary placeholder-text-subtle focus:ring-1 focus:ring-teal focus:border-teal transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="2,000"
                      type="text"
                      inputMode="numeric"
                      value={amount}
                      disabled={!epochUnlocked}
                      onChange={(e) => setAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onDeposit();
                      }}
                    />
                  </div>
                  <button
                    onClick={onDeposit}
                    disabled={!epochUnlocked}
                    className="bg-gradient-to-r from-teal to-teal-deep text-obsidian font-bold py-3 px-8 rounded-xl hover:shadow-[0_0_20px_rgba(45,212,191,0.4)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
                  >
                    Deposit
                  </button>
                </div>
                {!epochUnlocked && (
                  <p className="text-[10px] text-text-subtle italic">
                    Deposits are epoch-locked — unlock the epoch in the Next Epoch card to deposit.
                  </p>
                )}
              </div>
            </div>
          </div>
          {/* Right Column: Quick Stats / Next Epoch */}
          <div className="lg:col-span-5 space-y-6">
            {/* Epoch Card */}
            <div className="glass-card shine rounded-xl p-6 border-l-4 border-l-teal">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-text-muted uppercase tracking-widest">Next Epoch</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      epochUnlocked ? "bg-teal animate-pulse" : "bg-text-subtle"
                    }`}
                  />
                  <span
                    className={`text-[10px] font-bold uppercase ${
                      epochUnlocked ? "text-teal" : "text-text-subtle"
                    }`}
                  >
                    {epochUnlocked ? "Open" : "Locked"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-6 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-display font-bold text-text-primary">14</p>
                  <p className="text-[9px] text-text-subtle uppercase">Hours</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-display font-bold text-text-primary">28</p>
                  <p className="text-[9px] text-text-subtle uppercase">Mins</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-display font-bold text-text-primary">11</p>
                  <p className="text-[9px] text-text-subtle uppercase">Secs</p>
                </div>
              </div>
              <button
                onClick={() => setEpochUnlocked((u) => !u)}
                className={`w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  epochUnlocked
                    ? "bg-teal/15 border border-teal/40 text-teal hover:bg-teal/25"
                    : "bg-gradient-to-r from-teal to-teal-deep text-obsidian hover:shadow-[0_0_20px_rgba(45,212,191,0.4)]"
                }`}
              >
                {epochUnlocked ? "Lock Epoch" : "Unlock Epoch (demo)"}
              </button>
            </div>
            {/* Navigational Group Cards */}
            <Link href="/vote" className="glass-card shine rounded-xl p-6 group cursor-pointer hover:translate-y-[-2px] transition-all duration-300 relative overflow-hidden block">
              <div className="absolute top-4 right-4 text-text-subtle group-hover:text-teal transition-colors">
                <span className="material-symbols-outlined text-lg">arrow_outward</span>
              </div>
              <div className="flex items-center gap-4 mb-3">
                <div className="w-10 h-10 rounded-lg bg-teal/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-teal">how_to_vote</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-text-primary">Cast Your Vote</h4>
                  <p className="text-[10px] text-text-subtle">Allocate your basket this cycle</p>
                </div>
              </div>
              <p className="text-xs text-text-muted">Influence the fund&apos;s direction by voting on new asset allocations and strategy shifts.</p>
            </Link>
            <Link href="/leaderboard" className="glass-card shine rounded-xl p-6 group cursor-pointer hover:translate-y-[-2px] transition-all duration-300 relative overflow-hidden block">
              <div className="absolute top-4 right-4 text-text-subtle group-hover:text-teal transition-colors">
                <span className="material-symbols-outlined text-lg">leaderboard</span>
              </div>
              <div className="flex items-center gap-4 mb-3">
                <div className="w-10 h-10 rounded-lg bg-teal/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-teal">emoji_events</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-text-primary">Leaderboard</h4>
                  <p className="text-[10px] text-text-subtle">Ranked among {members} members</p>
                </div>
              </div>
              <p className="text-xs text-text-muted">Compare your portfolio accuracy against the community. Earn badges for top-tier forecasting.</p>
            </Link>
          </div>
        </div>
        {/* Basket List Section — shared component (same UI on the Overview).
            basis = total fund AUM, so each row shows its cash slice of ~$43.8K. */}
        <Holdings basis={totals.aum} basisLabel="Fund allocation" className="mt-20" />
      </main>
    </>
  );
}
