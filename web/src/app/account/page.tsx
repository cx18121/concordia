import Link from "next/link";
import PerformanceChart from "@/components/PerformanceChart";
import "@/styles/account.css";

const DEMO_DEPOSIT = 1_000;
const NAV_PER_SHARE = 1.188;
const DEMO_VALUE = Math.round(DEMO_DEPOSIT * NAV_PER_SHARE * 100) / 100;
const DEMO_GAIN = DEMO_VALUE - DEMO_DEPOSIT;

function fmtUsd(v: number) {
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Fund basket — weights must sum to 1 (remaining ~42.5% is cash/other).
// perf is 1-month return for each stock.
const BASKET = [
  { ticker: "NVDA", name: "Nvidia",    token: "mNVDA", weight: 0.241, perf: 0.184,  bgCls: "bg-teal/20",       textCls: "text-teal"      },
  { ticker: "MSFT", name: "Microsoft", token: "mMSFT", weight: 0.184, perf: 0.072,  bgCls: "bg-cyan-500/20",   textCls: "text-cyan-400"  },
  { ticker: "AAPL", name: "Apple",     token: "mAAPL", weight: 0.150, perf: -0.026, bgCls: "bg-blue-500/20",   textCls: "text-blue-400"  },
];

export default function AccountPage() {
  return (
    <>
      <main className="max-w-[1140px] mx-auto pt-32 pb-20 px-6 relative z-10">
        {/* Global Stats Row */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-0 mb-16 items-center">
          <div className="px-6 border-r border-white/10 last:border-0 py-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-subtle mb-1">Assets Under Mgmt</p>
            <h2 className="font-display text-4xl font-extrabold text-text-primary">$43.8K</h2>
          </div>
          <div className="px-6 border-r border-white/10 last:border-0 py-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-subtle mb-1">NAV / Share</p>
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-4xl font-extrabold text-text-primary">1.188</h2>
              <span className="text-gain text-sm font-semibold">▲ 18.8%</span>
            </div>
          </div>
          <div className="px-6 border-r border-white/10 last:border-0 py-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-subtle mb-1">S&amp;P Benchmark</p>
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-4xl font-extrabold text-text-primary">1.028</h2>
              <span className="text-gain text-sm font-semibold">▲ 2.8%</span>
            </div>
          </div>
          <div className="px-6 border-r border-white/10 last:border-0 py-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-subtle mb-1">Alpha vs S&amp;P</p>
            <h2 className="font-display text-4xl font-extrabold text-teal">+16.0%</h2>
          </div>
        </section>
        <PerformanceChart endNav={DEMO_VALUE} />
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Your Stake */}
          <div className="lg:col-span-7">
            <div className="glass-card shine rounded-xl p-8 transition-transform hover:translate-y-[-4px] duration-300">
              <div className="flex justify-between items-start mb-10">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-subtle mb-1">Your Position Value</p>
                  <div className="flex items-baseline gap-3">
                    <h1 className="text-5xl font-display font-extrabold text-text-primary tracking-tight">{fmtUsd(DEMO_VALUE)}</h1>
                    <span className="px-2 py-0.5 rounded bg-teal/10 text-teal text-[10px] font-bold uppercase tracking-wide border border-teal/20">100% of fund</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-text-subtle cursor-pointer hover:text-text-primary transition-colors">north_east</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
                <div>
                  <p className="text-[10px] text-text-subtle uppercase mb-1">Deposited</p>
                  <p className="text-sm font-semibold">{fmtUsd(DEMO_DEPOSIT)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-subtle uppercase mb-1">Accuracy</p>
                  <p className="text-sm font-semibold text-gain">+0.6%</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-subtle uppercase mb-1">Cycles played</p>
                  <p className="text-sm font-semibold">5</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-subtle uppercase mb-1">Claimable</p>
                  <p className="text-sm font-semibold text-teal">{fmtUsd(Math.round(DEMO_GAIN * 0.085 * 100) / 100)}</p>
                </div>
              </div>
              <div className="h-px w-full bg-white/10 mb-10" />
              <div className="space-y-6">
                <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Expand Position</h4>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">$</span>
                    <input className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-8 pr-4 text-text-primary placeholder-text-subtle focus:ring-1 focus:ring-teal focus:border-teal transition-all outline-none" placeholder="2,000" type="text" />
                  </div>
                  <button className="bg-gradient-to-r from-teal to-teal-deep text-obsidian font-bold py-3 px-8 rounded-xl hover:shadow-[0_0_20px_rgba(45,212,191,0.4)] active:scale-[0.98] transition-all">Deposit</button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-teal hover:text-teal-bright flex items-center gap-1 transition-colors cursor-pointer">
                    <span className="material-symbols-outlined text-sm">add_circle</span>
                    Mint demo USDC
                  </span>
                  <p className="text-[10px] text-text-subtle italic">Deposits are epoch-locked — they activate at the next cycle open</p>
                </div>
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
                  <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
                  <span className="text-[10px] font-bold text-teal uppercase">Open</span>
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
              <button className="w-full py-2.5 rounded-lg border border-white/10 text-xs font-bold text-text-muted hover:bg-white/5 hover:text-text-primary transition-all">View Governance Timeline</button>
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
                  <p className="text-[10px] text-text-subtle">3 Active Proposals</p>
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
                  <p className="text-[10px] text-text-subtle">Rank #42 of 1,284</p>
                </div>
              </div>
              <p className="text-xs text-text-muted">Compare your portfolio accuracy against the community. Earn badges for top-tier forecasting.</p>
            </Link>
          </div>
        </div>
        {/* Basket List Section */}
        <section className="mt-20">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-display font-bold text-text-primary">Fund Composition</h3>
            <button className="text-xs font-semibold text-text-subtle hover:text-text-primary transition-colors">View All Assets</button>
          </div>
          <div className="space-y-0">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-white/5">
              <div className="col-span-4 text-[10px] font-bold text-text-subtle uppercase tracking-widest">Asset</div>
              <div className="col-span-1 text-[10px] font-bold text-text-subtle uppercase tracking-widest text-right">Wt</div>
              <div className="col-span-2 text-[10px] font-bold text-text-subtle uppercase tracking-widest text-right">Invested</div>
              <div className="col-span-2 text-[10px] font-bold text-text-subtle uppercase tracking-widest text-right">Value Now</div>
              <div className="col-span-2 text-[10px] font-bold text-text-subtle uppercase tracking-widest text-right">Gain (1M)</div>
              <div className="col-span-1" />
            </div>
            {/* Asset Rows — driven by BASKET + DEMO_DEPOSIT */}
            {BASKET.map((s) => {
              const initial = Math.round(DEMO_DEPOSIT * s.weight * 100) / 100;
              const current = Math.round(initial * (1 + s.perf) * 100) / 100;
              const dGain   = Math.round((current - initial) * 100) / 100;
              const up = s.perf >= 0;
              return (
                <div key={s.ticker} className="grid grid-cols-12 gap-4 px-4 py-5 border-b border-white/5 items-center hover:bg-white/5 transition-colors group cursor-pointer">
                  <div className="col-span-4 flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full ${s.bgCls} flex items-center justify-center font-bold text-[11px] ${s.textCls}`}>{s.ticker}</div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">{s.name}</p>
                      <p className="text-xs text-text-subtle">{s.token}</p>
                    </div>
                  </div>
                  <div className="col-span-1 text-right">
                    <p className="text-sm font-semibold text-text-primary">{(s.weight * 100).toFixed(1)}%</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-sm font-semibold text-text-subtle">{fmtUsd(initial)}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className={`text-sm font-semibold ${up ? "text-gain" : "text-loss"}`}>{fmtUsd(current)}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className={`text-sm font-bold ${up ? "text-gain" : "text-loss"}`}>
                      {up ? "+" : ""}{(s.perf * 100).toFixed(1)}%
                    </p>
                    <p className={`text-[10px] ${up ? "text-gain" : "text-loss"}`}>
                      {dGain >= 0 ? "+" : "-"}${Math.abs(dGain).toFixed(2)}
                    </p>
                  </div>
                  <div className="col-span-1 text-right">
                    <span className="material-symbols-outlined text-text-subtle group-hover:text-text-primary opacity-0 group-hover:opacity-100 transition-all">chevron_right</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
      {/* Atmospheric Footer */}
      <footer className="max-w-[1140px] mx-auto py-12 px-6 border-t border-white/5 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 grayscale opacity-40">
            <div className="w-6 h-6 bg-text-subtle rounded flex items-center justify-center">
              <span className="material-symbols-outlined text-obsidian text-[12px]">shield</span>
            </div>
            <span className="text-xs font-bold text-text-subtle">Protocol Insured by Nexus</span>
          </div>
          <div className="flex items-center gap-8">
            <span className="text-[10px] font-bold text-text-subtle uppercase tracking-widest hover:text-teal transition-colors cursor-pointer">Documentation</span>
            <span className="text-[10px] font-bold text-text-subtle uppercase tracking-widest hover:text-teal transition-colors cursor-pointer">Governance</span>
            <span className="text-[10px] font-bold text-text-subtle uppercase tracking-widest hover:text-teal transition-colors cursor-pointer">Risk Disclaimer</span>
          </div>
          <p className="text-[10px] text-text-subtle">© 2024 Concordia DAO. Precision yields for the collective.</p>
        </div>
      </footer>
    </>
  );
}
