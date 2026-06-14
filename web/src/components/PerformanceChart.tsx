"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { TOTAL_FUND_AUM_USD } from "@/lib/data";

// SPY daily closes; FUND = amplified SPY returns using the SAME drift constants
// as the Overview hero curve, scaled to the `endNav` prop (the fund AUM passed in).
const SPY_RAW = [
  680.73, 678.87, 671.4, 676.47, 680.59, 684.83, 687.96, 690.38, 690.31,
  687.85, 687.01, 681.92, 683.17, 687.72, 691.81, 689.58, 689.51, 694.07,
  695.16, 693.77, 690.36, 692.24, 691.66, 677.58, 685.4, 688.98, 689.23,
  692.73, 695.49, 695.42, 694.04, 691.97, 695.41, 689.53, 686.19, 677.62,
  690.62, 693.95, 692.12, 691.96, 681.27, 681.75, 682.85, 686.29, 684.48,
  689.43, 682.39, 687.35, 693.15, 689.3, 685.99, 686.38, 680.33, 685.13,
  681.31, 672.38, 678.27, 677.18, 676.33, 666.06, 662.29, 669.03, 670.79,
  661.43, 659.8, 648.57, 655.38, 653.18, 656.82, 645.09, 634.09, 631.97,
  650.34, 655.24, 655.83, 658.93, 659.22, 676.01, 679.91, 679.46, 686.1,
  694.46, 699.94, 701.66, 710.14, 708.72, 704.08, 711.21, 708.45, 713.94,
  715.17, 711.69, 711.58, 718.66, 720.65, 718.01, 723.77, 733.83, 731.58,
  737.62, 739.3, 738.18, 742.31, 748.17, 739.17, 738.65, 733.73, 741.25,
  742.72, 745.64, 750.59, 750.46, 754.6, 756.48, 758.54, 759.57, 754.24,
  757.09, 737.55, 739.22, 737.05, 725.43, 737.76, 741.75,
];
const N = SPY_RAW.length;

const FUND_IDX: number[] = [100];
for (let i = 1; i < N; i++) {
  const r = SPY_RAW[i] / SPY_RAW[i - 1] - 1;
  // Amplified S&P returns + steady alpha drift → the fund visibly outperforms
  // the benchmark (clear positive alpha, widening over the window). Same
  // constants as Overview so the two fund curves agree.
  FUND_IDX.push(FUND_IDX[i - 1] * (1 + r * 1.12 + 0.0011));
}
// Scaled dynamically from the endNav prop; fallback keeps the Overview's original value.
function buildSeries(endNav: number) {
  const fsc = endNav / FUND_IDX[N - 1];
  const fusd = FUND_IDX.map((v) => v * fsc);
  const spyNorm = SPY_RAW.map((v) => (v / SPY_RAW[0]) * fusd[0]);
  return { fusd, spyNorm };
}

const DATES: string[] = [];
const d0 = new Date(2024, 1, 26);
for (let k = 0; k < N; k++) {
  const dd = new Date(d0.getTime() + k * 1.42 * 864e5);
  DATES.push(dd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
}

const PERIODS = ["1M", "3M", "6M", "YTD", "ALL"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_N: Record<Period, number> = { "1M": 22, "3M": 64, "6M": 90, YTD: N, ALL: N };
const PERIOD_AXIS: Record<Period, string[]> = {
  "1M": ["Wk 1", "Wk 2", "Wk 3", "Wk 4"],
  "3M": ["Apr", "May", "Jun"],
  "6M": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
  YTD: ["Q1", "Q2", "Q3", "Q4"],
  ALL: ["2024", "2025"],
};

const W = 1000;
const H = 400;

const fmt = (v: number) =>
  "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PerformanceChart({ endNav = TOTAL_FUND_AUM_USD }: { endNav?: number }) {
  const [period, setPeriod] = useState<Period>("1M");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { fusd: FUSD, spyNorm: SPY_NORM } = useMemo(() => buildSeries(endNav), [endNav]);

  const cnt = PERIOD_N[period];
  const start = Math.max(0, N - cnt);
  const fund = FUSD.slice(start);
  const spy = SPY_NORM.slice(start);
  const dates = DATES.slice(start);
  const m = fund.length;

  const allVals = [...fund, ...spy];
  const fMin = Math.min(...allVals);
  const fMax = Math.max(...allVals);
  const pad = (fMax - fMin) * 0.16 || 1;
  const mn = fMin - pad;
  const mx = fMax + pad;

  const X = (i: number) => (m > 1 ? (i / (m - 1)) * W : W / 2);
  const Y = (v: number) => H - 14 - ((v - mn) / (mx - mn)) * (H - 28);

  const fundPts = fund.map((v, i) => [X(i), Y(v)]);
  const spyPts = spy.map((v, i) => [X(i), Y(v)]);

  const fundLine = fundPts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const fundArea = fundLine + ` ${W},${H} 0,${H}`;
  const spyLine = spyPts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      setHoverIdx(Math.round(t * (m - 1)));
    },
    [m],
  );

  const di = hoverIdx ?? m - 1;
  const val = fund[di];
  const base = fund[0];
  const dv = val - base;
  const pct = (val / base - 1) * 100;
  const up = val >= base;

  const cx = fundPts[di]?.[0] ?? 0;
  const cy = fundPts[di]?.[1] ?? 0;
  // cy is in SVG units (0–H). Container is fixed 400px = H, so cy ≈ pixel offset.
  const tooltipBelow = cy < 80;
  const tooltipLeftPct = m > 1 ? (di / (m - 1)) * 100 : 50;

  return (
    <section className="mb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-xl font-display font-bold text-text-primary">Performance</h3>
          <p className="text-sm text-text-subtle">Your Position vs S&amp;P 500</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-[3px] rounded-full bg-teal" />
              <span className="text-xs text-text-muted">Concordia</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 border-t border-dashed border-text-subtle" />
              <span className="text-xs text-text-muted">S&amp;P 500</span>
            </div>
          </div>
          <div className="flex bg-white/5 rounded-full p-1 border border-white/5">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setHoverIdx(null); }}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                  period === p
                    ? "text-teal bg-white/10 shadow-sm"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Value readout */}
      <div className="mb-4 h-[52px]">
        <div className="text-3xl font-display font-extrabold text-text-primary tabular-nums">
          {fmt(val)}
        </div>
        <div className={`text-sm font-semibold tabular-nums mt-0.5 ${up ? "text-gain" : "text-loss"}`}>
          {up ? "▲" : "▼"} {dv >= 0 ? "+" : "-"}$
          {Math.abs(dv).toLocaleString(undefined, { maximumFractionDigits: 0 })} ·{" "}
          {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
          {hoverIdx !== null && (
            <span className="text-text-subtle font-normal ml-2">{dates[di]}</span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="relative w-full" style={{ height: 400 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible"
          style={{ cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="perf-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* S&P benchmark — clearly distinct from the fund line (muted grey,
              dashed) and sitting visibly below it (the fund's positive alpha). */}
          <polyline
            points={spyLine}
            fill="none"
            stroke="#8A94A6"
            strokeDasharray="7,5"
            strokeWidth="2"
            opacity="0.85"
          />
          {/* Fill */}
          <polygon points={fundArea} fill="url(#perf-fill)" />
          {/* Fund line */}
          <polyline
            points={fundLine}
            fill="none"
            stroke="#2DD4BF"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Hover crosshair */}
          {hoverIdx !== null && (
            <>
              <line
                x1={cx} x2={cx}
                y1={0} y2={H}
                stroke="white"
                strokeWidth="1"
                strokeOpacity="0.35"
              />
              <circle
                cx={cx} cy={cy}
                r="5"
                fill="#2DD4BF"
                stroke="white"
                strokeWidth="2"
              />
            </>
          )}

          {/* Pulse at end when idle */}
          {hoverIdx === null && (
            <circle cx={fundPts[m - 1][0]} cy={fundPts[m - 1][1]} r="4" fill="#2DD4BF">
              <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" />
            </circle>
          )}
        </svg>

        {/* Tooltip */}
        {hoverIdx !== null && (
          <div
            style={{
              position: "absolute",
              // clamp horizontally so it doesn't overflow the container
              left: `clamp(0px, calc(${tooltipLeftPct.toFixed(1)}% - 70px), calc(100% - 140px))`,
              top: tooltipBelow ? `${cy + 10}px` : `${cy - 10}px`,
              transform: tooltipBelow ? "none" : "translateY(-100%)",
              pointerEvents: "none",
              background: "rgba(8,16,28,0.94)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 12,
              color: "#f4f7fa",
              whiteSpace: "nowrap",
              zIndex: 10,
            }}
          >
            <div style={{ color: "#7e8a98", fontSize: 10, marginBottom: 3 }}>{dates[di]}</div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(val)}</div>
            <div style={{ color: up ? "#34d399" : "#f87171", fontWeight: 600, marginTop: 1 }}>
              {dv >= 0 ? "+" : "-"}$
              {Math.abs(dv).toLocaleString(undefined, { maximumFractionDigits: 0 })} ·{" "}
              {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
            </div>
          </div>
        )}

        {/* Time axis */}
        <div className="absolute left-0 right-0 flex justify-between px-2 text-[10px] uppercase font-semibold text-text-subtle tracking-wider"
          style={{ bottom: -24 }}>
          {PERIOD_AXIS[period].map((l) => <span key={l}>{l}</span>)}
        </div>
      </div>
    </section>
  );
}
