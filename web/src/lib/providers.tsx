"use client";

// Mounts the provider tree for the current mode. Live mode's reads self-poll the
// chain, so it needs only the auth provider; mock mode needs the mock auth + data
// providers. Toggling mode swaps Tree's root, so React remounts everything below
// and each hook re-reads mode — no page reload needed.

import type { ReactNode } from "react";
import { useMode } from "./mode";
import { MockAuthProvider } from "./mockAuth";
import { AuthProvider } from "./auth";
import { MockDataProvider } from "./data";

export function AppProviders({ children }: { children: ReactNode }) {
  const mode = useMode();
  return mode === "mock" ? (
    <MockAuthProvider>
      <MockDataProvider>{children}</MockDataProvider>
    </MockAuthProvider>
  ) : (
    <AuthProvider>{children}</AuthProvider>
  );
}
