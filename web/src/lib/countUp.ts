// Animated count-up for data-bound numbers, ported verbatim from
// redesign/mockups/shell.js. Operates on a DOM element: reads `data-count`
// (target), optional `data-suffix` and `data-dec`, derives the prefix from the
// element's current text, and eases toward the target. Respects
// prefers-reduced-motion by snapping straight to the final value.
// Framework-agnostic so later data-bound numbers can reuse it.
export function countUp(el: HTMLElement): void {
  const target = parseFloat(el.getAttribute("data-count") || "");
  if (isNaN(target)) return;
  const prefix = (el.textContent?.match(/^[^0-9.-]*/) || [""])[0];
  const suffix = el.getAttribute("data-suffix") || "";
  const decAttr = el.getAttribute("data-dec");
  const dec = decAttr != null ? +decAttr : 2;
  const fmt = (v: number) =>
    prefix +
    v.toLocaleString(undefined, {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }) +
    suffix;

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    el.textContent = fmt(target);
    return;
  }

  let t0: number | null = null;
  const dur = 950;
  function step(ts: number) {
    if (t0 === null) t0 = ts;
    const p = Math.min((ts - t0) / dur, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(target * e);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
