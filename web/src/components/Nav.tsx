"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePosition } from "@/lib/data";
import { ModeToggle } from "@/lib/mode";

const fmtUsd = (v: number) =>
  "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Tabs: [label, href, isActive(pathname)]. Active state derives from the
// current path instead of shell.js's body.dataset.page.
const TABS: [string, string, (p: string) => boolean][] = [
  ["Overview", "/", (p) => p === "/"],
  ["Vote", "/vote", (p) => p.startsWith("/vote")],
  ["Forum", "/forum", (p) => p.startsWith("/forum")],
  ["Leaderboard", "/leaderboard", (p) => p.startsWith("/leaderboard")],
  ["Account", "/account", (p) => p.startsWith("/account")],
];

export default function Nav() {
  const pathname = usePathname();
  // The wallet chip shows the viewer's own position value (moves with deposits +
  // resolves), not a hardcoded fund total.
  const { navUsd } = usePosition();

  return (
    <nav>
      <span className="sheen" />
      <Link className="brand" href="/">
        <div className="mark">
          <svg viewBox="0 0 24 24">
            <g style={{ strokeWidth: 1.4 }}>
              <line x1="12" y1="12" x2="12" y2="4.5" />
              <line x1="12" y1="12" x2="18.5" y2="8.25" />
              <line x1="12" y1="12" x2="18.5" y2="15.75" />
              <line x1="12" y1="12" x2="12" y2="19.5" />
              <line x1="12" y1="12" x2="5.5" y2="15.75" />
              <line x1="12" y1="12" x2="5.5" y2="8.25" />
              <polyline points="18.5,8.25 12,4.5 5.5,8.25 5.5,15.75 12,19.5 18.5,15.75" fill="none" />
            </g>
            <g style={{ fill: "#04201C", stroke: "none" }}>
              <circle cx="12" cy="4.5" r="2.3" />
              <circle cx="18.5" cy="8.25" r="2.3" />
              <circle cx="18.5" cy="15.75" r="2.3" />
              <circle cx="12" cy="19.5" r="2.3" />
              <circle cx="5.5" cy="15.75" r="2.3" />
              <circle cx="5.5" cy="8.25" r="2.3" />
              <circle cx="12" cy="12" r="3.4" />
            </g>
          </svg>
        </div>
        <b>Concordia</b>
      </Link>
      <div className="tabs">
        {TABS.map(([label, href, isActive]) => (
          <Link
            key={href}
            href={href}
            className={`tab${isActive(pathname) ? " on" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="navr">
        <ModeToggle />
        <span className="wal tnum">{fmtUsd(navUsd)}</span>
        <Link className="gear" href="/settings" aria-label="Settings">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.85"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </Link>
      </div>
    </nav>
  );
}
