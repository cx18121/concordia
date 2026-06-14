"use client";

// Overview — the cinematic public landing page (Track B, Task B3).
//
// Markup + the imperative animation are ported from
// redesign/mockups/cinematic.html. The big inline IIFE there runs here inside a
// single useEffect that returns a cleanup removing EVERY window/document
// listener, disconnecting the IntersectionObserver, and cancelling the count-up
// RAF — so React 19 StrictMode's double-invoke in dev doesn't leave doubled
// handlers. The hero number + SVG chart stay on the cinematic's own seeded
// performance series (the fund's mock NAV history; B7 swaps to a live read).
//
// The LIVE data bindings are rendered by React (not the effect): the cycle
// countdown reads useCycle().secondsLeft (re-renders every second) and the
// "Your position" chip reads usePosition(). Keeping these in JSX means the
// per-second re-render never tears down or rebuilds the imperative animation.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCycle, usePosition, useFundBasket } from "@/lib/data";
import Holdings from "@/components/Holdings";
import "@/styles/overview.css";

function fmtClock(secs: number): string {
  const s = Math.max(0, secs);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function Overview() {
  const router = useRouter();
  const { secondsLeft } = useCycle();
  const position = usePosition();

  // Keep router reachable from the [] animation effect without re-running it on
  // each router identity change. Sync the ref in its own effect (not during
  // render — react-hooks/refs forbids that).
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  // Same trick for the position — the hero number + chart scale to the
  // viewer's own holdings, read once when the animation effect mounts.
  const positionRef = useRef(position);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // The donut's stock view reads the SAME rotating basket as the Holdings table
  // (useFundBasket), via a ref so the imperative effect can read it on toggle.
  const basket = useFundBasket();
  const basketRef = useRef(basket);
  useEffect(() => {
    basketRef.current = basket;
  }, [basket]);

  useEffect(() => {
    const RM =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Map the mockup's *.html hrefs to Next routes. Forum is cut from v1.
    const ROUTE: Record<string, string> = {
      "vote.html": "/vote",
      "stitch-leaderboard.html": "/leaderboard",
      "account.html": "/account",
    };

    const SPY = [
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
    const N = SPY.length;
    const FUND = [100];
    for (let i = 1; i < N; i++) {
      const r = SPY[i] / SPY[i - 1] - 1;
      FUND.push(FUND[i - 1] * (1 + (r * 1.12 + 0.0011)));
    }
    // Anchor the series to the VIEWER's own position: it starts at their cost
    // basis and ends at their current NAV, following the fund's curve shape in
    // between. So the hero number ($NAV), the $ change, and the % change all
    // reconcile to the viewer's REAL return (flat + 0% right after depositing),
    // instead of projecting the fund's all-time +25.94% onto a fresh balance.
    const END = positionRef.current.navUsd;
    const START = positionRef.current.costUsd || END;
    const f0 = FUND[0];
    const fN = FUND[N - 1];
    const FUSD = FUND.map((v) =>
      fN === f0 ? END : START + (END - START) * ((v - f0) / (fN - f0)),
    );
    // S&P mapped through the SAME affine transform as the fund (both start at
    // START), so the benchmark is compressed into the viewer's return frame too
    // and ends BELOW the fund — the gap is the fund's alpha, matching the Account
    // chart. Previously the S&P kept its full multi-year growth while the fund was
    // squashed to the viewer's small return, so the benchmark wrongly towered over it.
    const spyIdx = SPY.map((v) => (v / SPY[0]) * f0); // S&P on the fund's index scale (shared f0 start)
    const SPY_NORM = spyIdx.map((v) =>
      fN === f0 ? FUSD[0] : START + (END - START) * ((v - f0) / (fN - f0)),
    );
    const DATES: string[] = [];
    const d0 = new Date(2024, 1, 26);
    for (let k = 0; k < N; k++) {
      const dd = new Date(d0.getTime() + k * 1.42 * 864e5);
      DATES.push(
        dd.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      );
    }
    const TF: Record<string, number> = {
      "1D": 6,
      "1W": 9,
      "1M": 22,
      "3M": 64,
      "1Y": N,
      ALL: N,
    };
    const TFAX: Record<string, string[]> = {
      "1D": ["10 AM", "12 PM", "2 PM", "4 PM"],
      "1W": ["Mon", "Wed", "Fri"],
      "1M": ["Wk 1", "Wk 2", "Wk 3", "Wk 4"],
      "3M": ["Apr", "May", "Jun"],
      "1Y": ["Sep", "Dec", "Mar", "Jun"],
      ALL: ["2024", "2025"],
    };
    const W = 1000;
    const H = 600;
    let fundPts: number[][] = [];
    let usd: number[] = [];
    let sliceStart = 0;
    // Tracked async work so cleanup can cancel it (StrictMode-safe).
    const pendingTimeouts = new Set<number>();
    let cuRaf = 0;

    const $ = (id: string) => document.getElementById(id);

    const fmt = (v: number) =>
      "$" +
      v.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    function setColor(up: boolean) {
      const c = up ? "#2DD4BF" : "#8A94A6";
      $("fundpath")!.setAttribute("stroke", c);
      $("fc0")!.setAttribute("stop-color", c);
      $("fc1")!.setAttribute("stop-color", c);
    }
    function readout(i: number) {
      const v = usd[i],
        base = usd[0],
        dv = v - base,
        pct = base ? (v / base - 1) * 100 : 0, // guard: zero position => +0.00%
        up = v >= base;
      $("val")!.textContent = fmt(v);
      const c = $("chg")!;
      c.innerHTML =
        (up ? "▲ " : "▼ ") +
        (dv >= 0 ? "" : "-") +
        "$" +
        Math.abs(dv).toLocaleString(undefined, { maximumFractionDigits: 0 }) +
        " · " +
        (pct >= 0 ? "+" : "") +
        pct.toFixed(2) +
        "%";
      c.classList.toggle("dn", !up);
      setColor(up);
    }
    function drawChart(tf: string) {
      const n = TF[tf],
        s = Math.max(0, N - n);
      sliceStart = s;
      const fu = FUSD.slice(s);
      const spu = SPY_NORM.slice(s);
      usd = fu;
      // Range fits BOTH lines so the benchmark never clips below the fund.
      let mn = Math.min(Math.min.apply(null, fu), Math.min.apply(null, spu)),
        mx = Math.max(Math.max.apply(null, fu), Math.max.apply(null, spu));
      const pad = (mx - mn) * 0.16 || 1;
      mn -= pad;
      mx += pad;
      const m = fu.length;
      const X = (i: number) => (i / (m - 1)) * W;
      const Y = (v: number) => H - 14 - ((v - mn) / (mx - mn)) * (H - 28);
      fundPts = fu.map((v, i) => [X(i), Y(v)]);
      const fp = fundPts
        .map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1))
        .join(" ");
      $("fundpath")!.setAttribute("points", fp);
      $("area")!.setAttribute("points", fp + " " + W + "," + H + " 0," + H);
      $("spypath")!.setAttribute(
        "points",
        spu.map((v, i) => X(i).toFixed(1) + "," + Y(v).toFixed(1)).join(" "),
      );
      $("axis")!.innerHTML = TFAX[tf]
        .map((l) => "<span>" + l + "</span>")
        .join("");
      document.querySelectorAll(".tf").forEach((b) => {
        b.classList.toggle("on", (b as HTMLElement).dataset.tf === tf);
      });
      readout(m - 1);
    }
    const tfs = $("tfs")!;
    const onTfClick = (e: Event) => {
      const b = (e.target as HTMLElement).closest(".tf") as HTMLElement | null;
      if (b) {
        e.stopPropagation();
        drawChart(b.dataset.tf!);
      }
    };
    tfs.addEventListener("click", onTfClick);

    const stage = $("stage")!;
    const sdot = $("sdot")!;
    const stip = $("stip")!;
    function scrub(cx: number) {
      const fr = document
        .querySelector(".chartfield")!
        .getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (cx - fr.left) / fr.width)),
        i = Math.round(t * (fundPts.length - 1)),
        p = fundPts[i];
      const px = (p[0] / W) * fr.width,
        py = (p[1] / H) * fr.height;
      sdot.style.left = px + "px";
      sdot.style.top = py + "px";
      stip.style.left = Math.min(fr.width - 80, Math.max(80, px)) + "px";
      stip.style.top = py - 26 + "px";
      stip.textContent = DATES[sliceStart + i] || "";
      stage.classList.add("scrubbing");
      readout(i);
    }
    function unscrub() {
      stage.classList.remove("scrubbing");
      readout(usd.length - 1);
    }

    const SECT = [
      { nm: "Technology", pc: 42, c: "#2DD4BF" },
      { nm: "Consumer Disc.", pc: 22, c: "#22D3EE" },
      { nm: "Communication", pc: 16, c: "#60A5FA" },
      { nm: "Financials", pc: 12, c: "#818CF8" },
      { nm: "Cash", pc: 8, c: "#475569" },
    ];
    // Stock view of the donut, derived from the live fund basket (top 5 by weight
    // + an aggregated "Others" slice) so the ring matches the Fund Composition
    // table below it. Rebuilt on each toggle so it tracks cycle rotation.
    const DONUT_COLORS = ["#2DD4BF", "#22D3EE", "#60A5FA", "#818CF8", "#A78BFA", "#475569"];
    function buildStocks() {
      const bk = basketRef.current;
      const top = bk.slice(0, 5);
      const othersPc = bk.slice(5).reduce((s, h) => s + h.weightPct, 0);
      const out = top.map((h, i) => ({
        nm: h.ticker,
        co: h.company,
        pc: Math.round(h.weightPct * 10) / 10,
        c: DONUT_COLORS[i],
      }));
      if (othersPc > 0)
        out.push({ nm: "Others", co: `${bk.length - 5} more`, pc: Math.round(othersPc * 10) / 10, c: DONUT_COLORS[5] });
      return out;
    }
    let dmode = 0;
    const CC = 2 * Math.PI * 80;
    const arcsEl = $("arcs")!;
    function drawDonut(d: { nm: string; pc: number; c: string; co?: string }[]) {
      while (arcsEl.children.length < 6)
        arcsEl.insertAdjacentHTML(
          "beforeend",
          '<circle class="arc" cx="100" cy="100" r="80" stroke="#2DD4BF" stroke-dasharray="0 ' +
            CC.toFixed(2) +
            '" stroke-dashoffset="0"/>',
        );
      let off = 0;
      for (let i = 0; i < 6; i++) {
        const c = arcsEl.children[i];
        if (i < d.length) {
          const len = (d[i].pc / 100) * CC;
          c.setAttribute("stroke", d[i].c);
          c.setAttribute(
            "stroke-dasharray",
            len.toFixed(2) + " " + (CC - len).toFixed(2),
          );
          c.setAttribute("stroke-dashoffset", (-off).toFixed(2));
          off += len;
        } else {
          c.setAttribute("stroke-dasharray", "0 " + CC.toFixed(2));
        }
      }
      const leg = $("leg")!;
      leg.style.opacity = "0";
      const tid = window.setTimeout(() => {
        leg.innerHTML = d
          .map(
            (x) =>
              '<div class="row"><span class="sw" style="background:' +
              x.c +
              ";color:" +
              x.c +
              '"></span><span class="nm">' +
              x.nm +
              (x.co ? "<s>" + x.co + "</s>" : "") +
              '</span><span class="pc tnum">' +
              x.pc +
              "%</span></div>",
          )
          .join("");
        leg.style.opacity = "1";
      }, 160);
      pendingTimeouts.add(tid);
      $("dctr")!.textContent = dmode ? String(basketRef.current.length) : "100%";
      $("dctrs")!.textContent = dmode ? "holdings" : "invested";
    }
    function toggleDonut() {
      const ring = $("ring")!;
      ring.classList.add("pop");
      const tid = window.setTimeout(() => {
        ring.classList.remove("pop");
      }, 560);
      pendingTimeouts.add(tid);
      dmode = dmode ? 0 : 1;
      drawDonut(dmode ? buildStocks() : SECT);
    }
    const ringEl = $("ring")!;
    const legEl = $("leg")!;
    const onRingClick = (e: Event) => {
      e.stopPropagation();
      toggleDonut();
    };
    const onLegClick = (e: Event) => {
      e.stopPropagation();
      toggleDonut();
    };
    ringEl.addEventListener("click", onRingClick);
    legEl.addEventListener("click", onLegClick);

    // Holdings are rendered by the shared <Holdings /> React component in the
    // #hold section (same UI + data as the Account page) — no imperative fill.

    drawChart("ALL");
    drawDonut(SECT);

    // count-up the hero number on load
    if (!RM) {
      const el = $("val")!;
      let t0: number | null = null;
      const cu = (ts: number) => {
        if (t0 === null) t0 = ts;
        const p = Math.min((ts - t0) / 950, 1),
          e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(END * e);
        if (p < 1) cuRaf = requestAnimationFrame(cu);
      };
      cuRaf = requestAnimationFrame(cu);
    }

    // ===== carousel =====
    const dots = Array.prototype.slice.call(
      document.querySelectorAll("#dots button"),
    ) as HTMLElement[];
    let curIdx = 0;
    function go(i: number) {
      curIdx = (i + 3) % 3;
      stage.dataset.s = String(curIdx);
      dots.forEach((d, k) => d.classList.toggle("on", k === curIdx));
      if (curIdx !== 1) unscrub();
    }
    const nextEl = $("next")!;
    const prevEl = $("prev")!;
    const onNext = (e: Event) => {
      e.stopPropagation();
      go(curIdx + 1);
    };
    const onPrev = (e: Event) => {
      e.stopPropagation();
      go(curIdx - 1);
    };
    nextEl.addEventListener("click", onNext);
    prevEl.addEventListener("click", onPrev);
    const dotHandlers: ((e: Event) => void)[] = [];
    dots.forEach((d, k) => {
      const h = (e: Event) => {
        e.stopPropagation();
        go(k);
      };
      dotHandlers.push(h);
      d.addEventListener("click", h);
    });
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(curIdx + 1);
      else if (e.key === "ArrowLeft") go(curIdx - 1);
    };
    document.addEventListener("keydown", onKeydown);
    const scrolldnEl = $("scrolldn")!;
    const onScrolldn = (e: Event) => {
      e.stopPropagation();
      $("hold")!.scrollIntoView({ behavior: "smooth" });
    };
    scrolldnEl.addEventListener("click", onScrolldn);

    // JS navigation for strip + holdings -> Next client nav (Forum is cut).
    const onDocClick = (e: Event) => {
      const t = (e.target as HTMLElement).closest(
        ".strip a[data-href],.holdrow[data-href]",
      ) as HTMLElement | null;
      if (t) {
        const dest = ROUTE[t.getAttribute("data-href") || ""];
        if (dest) routerRef.current.push(dest);
      }
    };
    document.addEventListener("click", onDocClick);

    // pointer drag
    let down = false,
      x0 = 0,
      moved = 0;
    const onPointerDown = (e: PointerEvent) => {
      if (
        (e.target as HTMLElement).closest(
          ".arw,.dots,.strip a,.tf,.ring,.leg,.scrolldn,a,button",
        )
      )
        return;
      down = true;
      x0 = e.clientX;
      moved = 0;
      stage.classList.add("grab");
    };
    stage.addEventListener("pointerdown", onPointerDown);
    const onPointerMove = (e: PointerEvent) => {
      if (down) {
        moved = e.clientX - x0;
        return;
      }
      if (curIdx === 1) {
        const fr = stage.getBoundingClientRect();
        if (
          e.clientX >= fr.left &&
          e.clientX <= fr.right &&
          e.clientY >= fr.top &&
          e.clientY <= fr.bottom
        )
          scrub(e.clientX);
      }
    };
    window.addEventListener("pointermove", onPointerMove);
    const onPointerUp = () => {
      if (!down) return;
      down = false;
      stage.classList.remove("grab");
      if (Math.abs(moved) > 45) go(curIdx + (moved < 0 ? 1 : -1));
    };
    window.addEventListener("pointerup", onPointerUp);
    const onPointerCancel = () => {
      down = false;
      stage.classList.remove("grab");
    };
    window.addEventListener("pointercancel", onPointerCancel);
    const onPointerLeave = () => {
      if (curIdx === 1) unscrub();
    };
    stage.addEventListener("pointerleave", onPointerLeave);

    // trackpad horizontal swipe only (vertical scroll passes through)
    let wlock = false;
    const onWheel = (e: WheelEvent) => {
      if (
        Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.6 &&
        Math.abs(e.deltaX) > 22
      ) {
        e.preventDefault();
        if (!wlock) {
          wlock = true;
          go(curIdx + (e.deltaX > 0 ? 1 : -1));
          const tid = window.setTimeout(() => {
            wlock = false;
          }, 480);
          pendingTimeouts.add(tid);
        }
      }
    };
    stage.addEventListener("wheel", onWheel, { passive: false });

    // touch swipe
    let tsx = 0,
      tsy = 0,
      tsw = 0,
      thh = 0;
    const onTouchStart = (e: TouchEvent) => {
      tsx = e.touches[0].clientX;
      tsy = e.touches[0].clientY;
      tsw = 0;
      thh = 0;
    };
    stage.addEventListener("touchstart", onTouchStart, { passive: true });
    const onTouchMove = (e: TouchEvent) => {
      tsw = e.touches[0].clientX - tsx;
      thh = e.touches[0].clientY - tsy;
    };
    stage.addEventListener("touchmove", onTouchMove, { passive: true });
    const onTouchEnd = () => {
      if (Math.abs(tsw) > 50 && Math.abs(tsw) > Math.abs(thh))
        go(curIdx + (tsw < 0 ? 1 : -1));
    };
    stage.addEventListener("touchend", onTouchEnd);

    // reveal-on-scroll
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window && !RM) {
      io = new IntersectionObserver(
        (es) => {
          es.forEach((en) => {
            if (en.isIntersecting) en.target.classList.add("in");
          });
        },
        { threshold: 0.12 },
      );
      document.querySelectorAll(".reveal").forEach((el) => io!.observe(el));
    } else {
      document
        .querySelectorAll(".reveal")
        .forEach((el) => el.classList.add("in"));
    }

    // ===== cleanup — StrictMode-safe: remove every listener, disconnect the
    // observer, cancel the count-up RAF, and clear pending timeouts. =====
    return () => {
      tfs.removeEventListener("click", onTfClick);
      ringEl.removeEventListener("click", onRingClick);
      legEl.removeEventListener("click", onLegClick);
      nextEl.removeEventListener("click", onNext);
      prevEl.removeEventListener("click", onPrev);
      dots.forEach((d, k) => d.removeEventListener("click", dotHandlers[k]));
      document.removeEventListener("keydown", onKeydown);
      scrolldnEl.removeEventListener("click", onScrolldn);
      document.removeEventListener("click", onDocClick);
      stage.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      stage.removeEventListener("pointerleave", onPointerLeave);
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("touchend", onTouchEnd);
      if (io) io.disconnect();
      if (cuRaf) cancelAnimationFrame(cuRaf);
      pendingTimeouts.forEach((t) => clearTimeout(t));
      pendingTimeouts.clear();
      // Reset the SVG/donut/holdings/legend the effect filled so a StrictMode
      // re-mount starts from the same empty DOM the JSX renders.
      arcsEl.innerHTML = "";
      const legReset = $("leg");
      if (legReset) legReset.innerHTML = "";
      const holdReset = $("holdings");
      if (holdReset) holdReset.innerHTML = "";
    };
  }, []);

  return (
    <>
      <section id="stage" data-s="0">
        <div className="chartfield">
          <svg id="chart" viewBox="0 0 1000 600" preserveAspectRatio="none">
            <defs>
              <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <stop id="fc0" offset="0" stopColor="#2DD4BF" stopOpacity=".26" />
                <stop id="fc1" offset="1" stopColor="#2DD4BF" stopOpacity="0" />
              </linearGradient>
              <filter id="g" x="-4%" y="-20%" width="108%" height="140%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <polygon id="area" points="" fill="url(#fill)" />
            {/* S&P benchmark — same treatment as the Account chart (muted grey,
                dashed) so the fund's positive alpha reads the same everywhere. */}
            <polyline
              id="spypath"
              points=""
              fill="none"
              stroke="#8A94A6"
              strokeWidth="2"
              strokeDasharray="7,5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.8"
            />
            <polyline
              id="fundpath"
              points=""
              fill="none"
              stroke="#2DD4BF"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#g)"
            />
          </svg>
        </div>
        <div className="sdot" id="sdot" />
        <div className="stip" id="stip" />

        <div className="value">
          {/* Neutral first-paint placeholders — readout() fills these with the
              viewer's real position value + change synchronously on mount. */}
          <div className="num tnum" id="val">
            $0.00
          </div>
          <div className="chg tnum" id="chg">
            —
          </div>
        </div>

        <div className="strip">
          <a data-href="vote.html">
            <svg className="i" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="m8 12 3 3 5-6" />
            </svg>
            Vote
          </a>
          <a data-href="stitch-leaderboard.html">
            <svg className="i" viewBox="0 0 24 24">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0Z" />
            </svg>
            Leaderboard
          </a>
        </div>

        {/* Live binding — countdown ticks from useCycle(). The hero number
            above is the viewer's own position value (END = position.navUsd). */}
        <div className="ovl-live">
          <span className="ovl-pill">
            <span className="dot" />
            <span className="lbl">Cycle closes in</span>
            <span className="clk tnum">{fmtClock(secondsLeft)}</span>
          </span>
        </div>

        <div className="perfx">
          <div className="axis" id="axis" />
          <div className="tfs" id="tfs">
            <button className="tf" data-tf="1D">
              1D
            </button>
            <button className="tf" data-tf="1W">
              1W
            </button>
            <button className="tf" data-tf="1M">
              1M
            </button>
            <button className="tf" data-tf="3M">
              3M
            </button>
            <button className="tf" data-tf="1Y">
              1Y
            </button>
            <button className="tf on" data-tf="ALL">
              ALL
            </button>
          </div>
        </div>

        <div className="alloc">
          <div className="ring" id="ring">
            <svg viewBox="0 0 200 200">
              <g id="arcs" />
            </svg>
            <div className="ctr">
              <b id="dctr">100%</b>
              <span id="dctrs">invested</span>
            </div>
          </div>
          <div className="leg" id="leg" />
        </div>

        <button className="arw l" id="prev">
          <svg className="i" viewBox="0 0 24 24">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button className="arw r" id="next">
          <svg className="i" viewBox="0 0 24 24">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        <div className="dots" id="dots">
          <button className="on" />
          <button />
          <button />
        </div>
        <button className="scrolldn" id="scrolldn" aria-label="Scroll to holdings">
          <svg className="i" viewBox="0 0 24 24">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </section>

      <section id="hold">
        <Holdings basis={position.navUsd} basisLabel="Your allocation" />
      </section>
    </>
  );
}
