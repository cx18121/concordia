"use client";

// NeuralBackground — a subtle, slowly-rotating "neural net / spider web" for the
// Join page. Nodes drift inside an oversized disk (so the corners stay covered as
// the whole field rotates) and links draw between nearby nodes, fading with
// distance. Kept deliberately faint (low alpha + a radial edge mask in CSS) so it
// sits behind the frosted-glass card without competing with it. Respects
// prefers-reduced-motion by rendering a single static frame.

import { useEffect, useRef } from "react";
import "@/styles/neural.css";

export default function NeuralBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const context = el.getContext("2d");
    if (!context) return;
    // Explicit non-null aliases: TS drops the guard narrowing inside the nested
    // animation closures, so re-bind to non-nullable types here.
    const canvas: HTMLCanvasElement = el;
    const ctx: CanvasRenderingContext2D = context;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const LINK = 142; // px: max distance a link is drawn (dense, well-connected web)
    let w = 0;
    let h = 0;
    let angle = 0;
    let raf = 0;
    let nodes: { x: number; y: number; vx: number; vy: number }[] = [];

    function fieldRadius() {
      // Larger than the half-diagonal so rotation never reveals empty corners.
      return 0.6 * Math.hypot(w, h);
    }

    function resize() {
      // The element is sized by CSS (inset:0), so it can never overflow its
      // parent. Read its laid-out size ONLY to match the backing-store
      // resolution — never write style width/height back: a stale explicit
      // height makes the absolute canvas overflow and forces phantom scroll.
      const parent = canvas.parentElement;
      w = canvas.clientWidth || parent?.clientWidth || window.innerWidth;
      h = canvas.clientHeight || parent?.clientHeight || window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Density scales with the FIELD disk (not the viewport) so the visible
      // area is richly covered — the disk is much larger than the screen.
      const R = fieldRadius();
      const count = Math.round(
        Math.min(340, Math.max(180, (Math.PI * R * R) / 7500)),
      );
      nodes = Array.from({ length: count }, () => {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * R; // uniform over the disk
        return {
          x: w / 2 + Math.cos(a) * r,
          y: h / 2 + Math.sin(a) * r,
          vx: (Math.random() - 0.5) * 0.16,
          vy: (Math.random() - 0.5) * 0.16,
        };
      });
    }

    function draw(animate: boolean) {
      const cx = w / 2;
      const cy = h / 2;
      const R = fieldRadius();

      if (animate) {
        for (const n of nodes) {
          n.x += n.vx;
          n.y += n.vy;
          // Reflect back in if a node drifts outside the field disk.
          const dx = n.x - cx;
          const dy = n.y - cy;
          if (dx * dx + dy * dy > R * R) {
            n.vx = -n.vx;
            n.vy = -n.vy;
            n.x += n.vx * 2;
            n.y += n.vy * 2;
          }
        }
        angle += 0.00022; // very slow rotation of the whole web
      }

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.translate(-cx, -cy);

      // Links — alpha fades with distance, capped low for subtlety.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK * LINK) {
            const d = Math.sqrt(d2);
            const alpha = (1 - d / LINK) * 0.17;
            ctx.strokeStyle = `rgba(82,224,205,${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Nodes — small, faint teal dots.
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(120,235,220,0.58)";
        ctx.fill();
      }

      ctx.restore();
    }

    function frame() {
      draw(true);
      raf = requestAnimationFrame(frame);
    }

    resize();
    if (reduce) {
      draw(false); // one static frame
    } else {
      raf = requestAnimationFrame(frame);
    }

    const onResize = () => {
      resize();
      if (reduce) draw(false);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className="neural-bg" aria-hidden="true" />;
}
