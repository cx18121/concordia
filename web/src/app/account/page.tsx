// Account / Portfolio — static mock port (Track B, Task B6).
//
// Markup + helper CSS are ported from redesign/mockups/account.html. This page
// is off the demo path and renders static mock content (the mockup's own
// seeded values). The performance chart is an inline SVG with hardcoded paths,
// so it's pre-rendered statically in JSX (the mockup's tiny random-pulse script
// is dropped — non-essential animation). No hooks → a plain server component.
// The mockup's *.html links become Next routes.

import Link from "next/link";
import MyAvatar from "@/components/MyAvatar";
import "@/styles/account.css";

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
        {/* Performance Chart Section */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-display font-bold text-text-primary">Performance</h3>
              <p className="text-sm text-text-subtle">Fund Performance vs Market Index</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-1 bg-teal rounded-full" />
                  <span className="text-xs text-text-muted">Community Fund</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-0 border-t border-dashed border-text-subtle" />
                  <span className="text-xs text-text-muted">S&amp;P 500</span>
                </div>
              </div>
              <div className="flex bg-white/5 rounded-full p-1 border border-white/5">
                <button className="px-3 py-1 text-xs font-semibold text-teal rounded-full bg-white/10 shadow-sm">1M</button>
                <button className="px-3 py-1 text-xs font-medium text-text-muted hover:text-text-primary">3M</button>
                <button className="px-3 py-1 text-xs font-medium text-text-muted hover:text-text-primary">6M</button>
                <button className="px-3 py-1 text-xs font-medium text-text-muted hover:text-text-primary">YTD</button>
                <button className="px-3 py-1 text-xs font-medium text-text-muted hover:text-text-primary">ALL</button>
              </div>
            </div>
          </div>
          {/* Robinhood-style Chart (static) */}
          <div className="relative w-full h-[400px]">
            <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 1000 400">
              <defs>
                <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Benchmark (S&P 500) */}
              <path d="M0,320 L100,310 L200,315 L300,290 L400,295 L500,280 L600,285 L700,270 L800,275 L900,265 L1000,260" fill="none" opacity="0.5" stroke="#7E8A98" strokeDasharray="6,4" strokeWidth="1.5" />
              {/* Area Fill */}
              <path className="chart-gradient" d="M0,350 L100,320 L200,280 L300,295 L400,220 L500,180 L600,210 L700,140 L800,110 L900,125 L1000,80 L1000,400 L0,400 Z" />
              {/* Fund Line */}
              <path className="drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]" d="M0,350 L100,320 L200,280 L300,295 L400,220 L500,180 L600,210 L700,140 L800,110 L900,125 L1000,80" fill="none" stroke="#2DD4BF" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
              {/* Pulse Point */}
              <circle className="animate-pulse" cx="1000" cy="80" fill="#5FF0DC" r="4">
                <animate attributeName="r" dur="2s" repeatCount="indefinite" values="4;6;4" />
              </circle>
            </svg>
            {/* Chart Labels (Time Axis) */}
            <div className="absolute bottom-[-24px] left-0 right-0 flex justify-between px-2 text-[10px] uppercase font-semibold text-text-subtle tracking-wider">
              <span>Oct 24</span>
              <span>Oct 31</span>
              <span>Nov 07</span>
              <span>Nov 14</span>
              <span>Nov 21</span>
              <span>Nov 28</span>
            </div>
          </div>
        </section>
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Your Stake */}
          <div className="lg:col-span-7">
            <div className="glass-card shine rounded-xl p-8 transition-transform hover:translate-y-[-4px] duration-300">
              <div className="flex justify-between items-start mb-10">
                <div className="flex items-center gap-4">
                  <MyAvatar name="You" size={56} />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-subtle mb-1">Your Position Value</p>
                    <div className="flex items-baseline gap-3">
                      <h1 className="text-5xl font-display font-extrabold text-text-primary tracking-tight">$5,942.50</h1>
                      <span className="px-2 py-0.5 rounded bg-teal/10 text-teal text-[10px] font-bold uppercase tracking-wide border border-teal/20">11.4% of fund</span>
                    </div>
                  </div>
                </div>
                <span className="material-symbols-outlined text-text-subtle cursor-pointer hover:text-text-primary transition-colors">north_east</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
                <div>
                  <p className="text-[10px] text-text-subtle uppercase mb-1">Deposited</p>
                  <p className="text-sm font-semibold">$5,000.00</p>
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
                  <p className="text-sm font-semibold text-teal">$8.05</p>
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
              <div className="col-span-5 text-[10px] font-bold text-text-subtle uppercase tracking-widest">Asset</div>
              <div className="col-span-2 text-[10px] font-bold text-text-subtle uppercase tracking-widest text-right">Weight</div>
              <div className="col-span-3 text-[10px] font-bold text-text-subtle uppercase tracking-widest text-right">Performance (1M)</div>
              <div className="col-span-2" />
            </div>
            {/* Asset Rows */}
            <div className="grid grid-cols-12 gap-4 px-4 py-6 border-b border-white/5 items-center hover:bg-white/5 transition-colors group cursor-pointer">
              <div className="col-span-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-teal/20 flex items-center justify-center font-bold text-[11px] text-teal">NVDA</div>
                <div>
                  <p className="text-sm font-bold text-text-primary">Nvidia</p>
                  <p className="text-xs text-text-subtle">mNVDA</p>
                </div>
              </div>
              <div className="col-span-2 text-right">
                <p className="text-sm font-semibold text-text-primary">24.1%</p>
              </div>
              <div className="col-span-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-sm font-bold text-gain">+18.4%</span>
                  <span className="material-symbols-outlined text-gain text-sm">trending_up</span>
                </div>
              </div>
              <div className="col-span-2 text-right">
                <span className="material-symbols-outlined text-text-subtle group-hover:text-text-primary opacity-0 group-hover:opacity-100 transition-all">chevron_right</span>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-4 px-4 py-6 border-b border-white/5 items-center hover:bg-white/5 transition-colors group cursor-pointer">
              <div className="col-span-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center font-bold text-[11px] text-cyan-400">MSFT</div>
                <div>
                  <p className="text-sm font-bold text-text-primary">Microsoft</p>
                  <p className="text-xs text-text-subtle">mMSFT</p>
                </div>
              </div>
              <div className="col-span-2 text-right">
                <p className="text-sm font-semibold text-text-primary">18.4%</p>
              </div>
              <div className="col-span-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-sm font-bold text-gain">+7.2%</span>
                  <span className="material-symbols-outlined text-gain text-sm">trending_up</span>
                </div>
              </div>
              <div className="col-span-2 text-right">
                <span className="material-symbols-outlined text-text-subtle group-hover:text-text-primary opacity-0 group-hover:opacity-100 transition-all">chevron_right</span>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-4 px-4 py-6 border-b border-white/5 items-center hover:bg-white/5 transition-colors group cursor-pointer">
              <div className="col-span-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center font-bold text-[11px] text-blue-400">AAPL</div>
                <div>
                  <p className="text-sm font-bold text-text-primary">Apple</p>
                  <p className="text-xs text-text-subtle">mAAPL</p>
                </div>
              </div>
              <div className="col-span-2 text-right">
                <p className="text-sm font-semibold text-text-primary">15.0%</p>
              </div>
              <div className="col-span-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-sm font-bold text-loss">-2.6%</span>
                  <span className="material-symbols-outlined text-loss text-sm">trending_down</span>
                </div>
              </div>
              <div className="col-span-2 text-right">
                <span className="material-symbols-outlined text-text-subtle group-hover:text-text-primary opacity-0 group-hover:opacity-100 transition-all">chevron_right</span>
              </div>
            </div>
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
          <p className="text-[10px] text-text-subtle">© 2024 Community Fund DAO. Precision yields for the collective.</p>
        </div>
      </footer>
    </>
  );
}
