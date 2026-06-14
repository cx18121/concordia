"use client";

// Mounts the provider tree for the current mode. Live mode's reads self-poll the
// chain, so it needs only the auth provider; mock mode needs the mock auth + data
// providers. Toggling mode swaps Tree's root, so React remounts everything below
// and each hook re-reads mode — no page reload needed.

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { useMode } from "./mode";
import { MockAuthProvider } from "./mockAuth";
import { MockDataProvider } from "./data";

// Dynamic import with ssr:false so @dynamic-labs/sdk-react-core (which touches
// localStorage at module init via WalletConnect) never runs during SSR/prerender.
const AuthProvider = dynamic(
  () => import("./auth").then((m) => m.AuthProvider),
  { ssr: false },
);

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
