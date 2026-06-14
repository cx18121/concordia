"use client";

// Holdings / Fund Composition — one shared table used on BOTH the Overview and
// the Account page (same UI, same data: useFundBasket()). The fund holds 10 names
// that rotate every cycle. Each row shows the CASH allocated to that holding,
// scaled to a per-page `basis`: the Overview passes YOUR position value (how your
// deposit is split across the basket), the Account passes the whole fund's AUM.
// Clicking a row expands an inline detail panel — it never navigates away. Single
// source of truth so the two pages can't drift.

import { useState } from "react";
import { useFundBasket } from "@/lib/data";

const fmtUsd = (v: number) => "$" + Math.round(v).toLocaleString("en-US");

export default function Holdings({
  basis,
  basisLabel = "Allocation",
  className = "",
}: {
  basis: number;
  basisLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const basket = useFundBasket();

  return (
    <section className={`max-w-[1140px] mx-auto ${className}`}>
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xl font-display font-bold text-text-primary">Fund Composition</h3>
        <span className="text-xs font-semibold text-text-subtle">
          {basket.length} holdings · {fmtUsd(basis)}
        </span>
      </div>
      <div className="space-y-0">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-white/5">
          <div className="col-span-5 text-[10px] font-bold text-text-subtle uppercase tracking-widest">Asset</div>
          <div className="col-span-3 text-[10px] font-bold text-text-subtle uppercase tracking-widest text-right">{basisLabel}</div>
          <div className="col-span-3 text-[10px] font-bold text-text-subtle uppercase tracking-widest text-right">Performance</div>
          <div className="col-span-1" />
        </div>
        {basket.map((h) => {
          const up = h.perfPct >= 0;
          const isOpen = open === h.ticker;
          const alloc = (h.weightPct / 100) * basis;
          return (
            <div key={h.ticker} className="border-b border-white/5">
              <button
                onClick={() => setOpen(isOpen ? null : h.ticker)}
                aria-expanded={isOpen}
                className="w-full grid grid-cols-12 gap-4 px-4 py-6 items-center text-left hover:bg-white/5 transition-colors group"
              >
                <div className="col-span-5 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[11px] ${h.accent}`}>
                    {h.ticker}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text-primary">{h.company}</p>
                    <p className="text-xs text-text-subtle">{h.ticker}</p>
                  </div>
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-sm font-semibold text-text-primary tabular-nums">{fmtUsd(alloc)}</p>
                  <p className="text-[11px] text-text-subtle">{h.weightPct.toFixed(1)}% weight</p>
                </div>
                <div className="col-span-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className={`text-sm font-bold ${up ? "text-gain" : "text-loss"}`}>
                      {up ? "+" : ""}
                      {h.perfPct.toFixed(1)}%
                    </span>
                    <span className={`material-symbols-outlined text-sm ${up ? "text-gain" : "text-loss"}`}>
                      {up ? "trending_up" : "trending_down"}
                    </span>
                  </div>
                </div>
                <div className="col-span-1 text-right">
                  <span
                    className={`material-symbols-outlined transition-transform duration-200 ${
                      isOpen ? "rotate-90 text-text-primary" : "text-text-subtle group-hover:text-text-primary"
                    }`}
                  >
                    chevron_right
                  </span>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-6 -mt-1">
                  <p className="text-sm text-text-muted leading-relaxed mb-5 max-w-2xl">{h.blurb}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <p className="text-[10px] text-text-subtle uppercase mb-1">{basisLabel}</p>
                      <p className="text-sm font-semibold text-text-primary tabular-nums">{fmtUsd(alloc)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-subtle uppercase mb-1">Fund weight</p>
                      <p className="text-sm font-semibold text-text-primary">{h.weightPct.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-subtle uppercase mb-1">Performance</p>
                      <p className={`text-sm font-semibold ${up ? "text-gain" : "text-loss"}`}>
                        {up ? "+" : ""}
                        {h.perfPct.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-subtle uppercase mb-1">Contribution</p>
                      <p className={`text-sm font-semibold ${up ? "text-gain" : "text-loss"}`}>
                        {up ? "+" : ""}
                        {((h.weightPct / 100) * h.perfPct).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
