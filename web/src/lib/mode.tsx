"use client";

// Runtime mock<->live switch. The build-time NEXT_PUBLIC_USE_MOCK is only the
// default; the in-app toggle (ModeToggle) overrides it and persists the choice.
// Everything that used to read the env flag now reads useMode()/useIsMock().
//
// Backed by a module-global store read through useSyncExternalStore: that gives a
// correct SSR snapshot (env default) on the server + during hydration, then the
// stored override on the client — no provider, no hydration mismatch.

import { useSyncExternalStore } from "react";

export type Mode = "mock" | "live";

/** Build-time default; a stored override (set via the toggle) wins on the client. */
const ENV_DEFAULT: Mode =
  process.env.NEXT_PUBLIC_USE_MOCK !== "false" ? "mock" : "live";

const STORAGE_KEY = "concordia:mode";

let current: Mode | null = null; // null until first client read
const listeners = new Set<() => void>();

function clientSnapshot(): Mode {
  if (current === null) {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    current = stored === "mock" || stored === "live" ? stored : ENV_DEFAULT;
  }
  return current;
}

// Server + hydration use the env default so the first client render matches SSR.
function serverSnapshot(): Mode {
  return ENV_DEFAULT;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function setMode(m: Mode): void {
  current = m;
  window.localStorage.setItem(STORAGE_KEY, m);
  listeners.forEach((l) => l());
}

/** Current data mode — env default, overridden by a stored toggle choice. */
export function useMode(): Mode {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}

export function useIsMock(): boolean {
  return useMode() === "mock";
}

/** Pill in the nav that flips demo/live and persists the choice. */
export function ModeToggle() {
  const isMock = useIsMock();
  return (
    <button
      type="button"
      onClick={() => setMode(isMock ? "live" : "mock")}
      title={
        isMock
          ? "Showing demo data. Click for live on-chain."
          : "Showing live on-chain data. Click for demo."
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        border: "1px solid rgba(255,255,255,.16)",
        background: isMock ? "rgba(255,255,255,.06)" : "rgba(74,222,128,.14)",
        color: isMock ? "#cbd5e1" : "#4ade80",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: isMock ? "#94a3b8" : "#4ade80",
        }}
      />
      {isMock ? "Demo" : "Live"}
    </button>
  );
}
