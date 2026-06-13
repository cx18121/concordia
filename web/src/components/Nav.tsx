"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { countUp } from "@/lib/countUp";

// Tabs: [label, href, isActive(pathname)]. Forum is cut from v1, so it is
// omitted (spec "Out of scope"). Active state derives from the current path
// instead of shell.js's body.dataset.page.
const TABS: [string, string, (p: string) => boolean][] = [
  ["Overview", "/", (p) => p === "/"],
  ["Vote", "/vote", (p) => p.startsWith("/vote")],
  ["Leaderboard", "/leaderboard", (p) => p.startsWith("/leaderboard")],
  ["Account", "/account", (p) => p.startsWith("/account")],
];

export default function Nav() {
  const pathname = usePathname();
  const walRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (walRef.current) countUp(walRef.current);
  }, []);

  return (
    <nav>
      <span className="sheen" />
      <Link className="brand" href="/">
        <div className="mark">
          <svg viewBox="0 0 24 24">
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M21 7v5" />
          </svg>
        </div>
        <b>Community Fund</b>
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
        <span ref={walRef} className="wal tnum" data-count="43820.50">
          $43,820.50
        </span>
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
