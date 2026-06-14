"use client";

// Single seam the pages import. Picks the mock or live auth at RUNTIME from the
// in-app mode toggle (mode.tsx), not at build time. Both context reads run every
// render (rules of hooks hold); only the unmounted one's value is ignored. The
// mock context has a default value and the live read is non-throwing, so the
// inactive provider being absent never throws.
import { useAuth as useMockAuth } from "./mockAuth";
import { useAuthRaw } from "./auth";
import { useMode } from "./mode";
import type { AuthState } from "./auth-types";

export function useAuth(): AuthState {
  const mode = useMode();
  const mock = useMockAuth();
  const live = useAuthRaw();
  if (mode === "mock") return mock;
  if (!live) throw new Error("AuthProvider missing — live mode needs it mounted");
  return live;
}
