"use client";

import dynamic from "next/dynamic";
import { MockAuthProvider } from "@/lib/mockAuth";
import { MockDataProvider } from "@/lib/data";

// AuthProvider pulls in WalletConnect which accesses localStorage at module init —
// must be client-only (ssr:false) to avoid crashing the server-side render pass.
const AuthProvider = dynamic(
  () => import("@/lib/auth").then((m) => m.AuthProvider),
  { ssr: false }
);

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

export function AppShell({ children }: { children: React.ReactNode }) {
  if (USE_MOCK) {
    return (
      <MockAuthProvider>
        <MockDataProvider>{children}</MockDataProvider>
      </MockAuthProvider>
    );
  }
  return <AuthProvider>{children}</AuthProvider>;
}
