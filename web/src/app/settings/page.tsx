"use client";

// Settings — static mock port (Track B, Task B6).
//
// Markup + helper CSS are ported from redesign/mockups/stitch-settings.html.
// Content is static mock (the mockup's own seeded values). The three live
// toggles are the only interaction — trivial and clearly part of the page — so
// they're reactified: each is a small piece of local state replacing the
// mockup's inline `onclick="this.classList.toggle('active')"`. The disabled
// (deposit/withdraw) toggle stays inert. Off the demo path.

import { useState } from "react";
import "@/styles/settings.css";

function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <div
      className={`toggle-switch${on ? " active" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    />
  );
}

export default function SettingsPage() {
  const [voteOnBehalf, setVoteOnBehalf] = useState(true);
  const [demoMode, setDemoMode] = useState(true);
  const [notifications, setNotifications] = useState(false);

  return (
    <main className="max-w-[800px] mx-auto pt-32 pb-24 px-6 relative z-10">
      {/* Page Header */}
      <header className="mb-12">
        <h1 className="text-5xl font-display text-[#F4F7FA] tracking-tight">Settings</h1>
      </header>
      {/* ACCOUNT SECTION */}
      <section className="mb-16">
        <h2 className="text-[11px] font-bold text-[#7E8A98] uppercase tracking-[0.1em] mb-6">Account</h2>
        <div className="space-y-0 border-t border-white/10">
          {/* World ID Row */}
          <div className="flex items-center justify-between py-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <span className="text-base font-medium text-[#F4F7FA]">World ID</span>
              <div className="flex items-center gap-1 text-[#2DD4BF]">
                <span className="material-symbols-outlined filled text-[18px]">check_circle</span>
                <span className="text-sm font-medium">Verified</span>
              </div>
            </div>
            <span className="material-symbols-outlined text-[#9AA7B4] cursor-pointer hover:text-[#F4F7FA] transition-colors">chevron_right</span>
          </div>
          {/* Wallet Row */}
          <div className="flex items-center justify-between py-6 border-b border-white/10">
            <div>
              <span className="block text-base font-medium text-[#F4F7FA]">Dynamic wallet</span>
              <span className="text-sm text-[#9AA7B4] tabular-nums tracking-wide">0x7a3f…b21 · Connected</span>
            </div>
            <button className="px-4 py-1.5 rounded-full border border-white/10 text-sm font-medium text-[#F4F7FA] hover:bg-white/5 transition-all active:scale-95">Switch</button>
          </div>
        </div>
      </section>
      {/* AGENT API ACCESS SECTION */}
      <section className="mb-16">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.2)] shine">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-display font-bold text-[#F4F7FA]">Agent API access</h2>
            <span className="material-symbols-outlined filled text-[#2DD4BF] text-[20px]">bolt</span>
          </div>
          <p className="text-[#9AA7B4] text-sm leading-relaxed mb-8 max-w-[480px]">
            Connect an AI agent to vote through your account — the same on-chain path you use.
          </p>
          {/* API Key Input */}
          <div className="mb-8">
            <label className="text-[10px] font-bold text-[#7E8A98] uppercase tracking-[0.05em] mb-2 block">Your API Key</label>
            <div className="flex items-center gap-4">
              <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 font-mono text-[#F4F7FA] text-sm flex items-center justify-between">
                <span className="tracking-widest">cf_live_••••••••••3f9a</span>
                <div className="flex gap-4">
                  <button className="text-[#2DD4BF] text-xs font-bold uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all">Copy</button>
                  <button className="text-[#2DD4BF] text-xs font-bold uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all">Regenerate</button>
                </div>
              </div>
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-[#7E8A98]">
              <span className="w-1 h-1 rounded-full bg-[#2DD4BF]" />
              AgentKit linked · one agent per verified human
            </p>
          </div>
          {/* Permissions */}
          <div className="space-y-4 pt-6 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#F4F7FA]">Vote on my behalf</span>
              <Toggle on={voteOnBehalf} onToggle={() => setVoteOnBehalf((v) => !v)} label="Vote on my behalf" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#7E8A98]">Deposit / withdraw</span>
                <span className="material-symbols-outlined text-[16px] text-[#7E8A98]">lock</span>
              </div>
              <div className="toggle-switch disabled" aria-disabled="true" />
            </div>
          </div>
        </div>
      </section>
      {/* PREFERENCES SECTION */}
      <section className="mb-24">
        <h2 className="text-[11px] font-bold text-[#7E8A98] uppercase tracking-[0.1em] mb-6">Preferences</h2>
        <div className="space-y-0 border-t border-white/10">
          {/* Demo Mode Row */}
          <div className="flex items-center justify-between py-6 border-b border-white/10">
            <div>
              <span className="block text-base font-medium text-[#F4F7FA]">Demo mode</span>
              <span className="text-sm text-[#7E8A98]">replaying 2024 at ~2000x</span>
            </div>
            <Toggle on={demoMode} onToggle={() => setDemoMode((v) => !v)} label="Demo mode" />
          </div>
          {/* Notifications Row */}
          <div className="flex items-center justify-between py-6 border-b border-white/10">
            <span className="text-base font-medium text-[#F4F7FA]">Notifications</span>
            <Toggle on={notifications} onToggle={() => setNotifications((v) => !v)} label="Notifications" />
          </div>
        </div>
      </section>
      {/* Footer Actions */}
      <footer className="flex flex-col items-center">
        <button className="text-[#FF6B6B] font-medium text-sm hover:underline underline-offset-4 active:scale-95 transition-all">
          Disconnect wallet
        </button>
        <div className="mt-12 text-[10px] text-[#7E8A98] uppercase tracking-[0.2em] font-medium">
          Community Fund v2.4.0-Stable
        </div>
      </footer>
    </main>
  );
}
