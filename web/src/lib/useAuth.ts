// Single seam all pages use. Reads from AuthContext, which is populated by either
// MockAuthProvider (mock mode, default) or AuthProvider (live mode, USE_MOCK=false).
// This file intentionally does NOT import auth.tsx — that module pulls in
// @dynamic-labs/ethereum → WalletConnect, which crashes on Node 25 during SSR.
"use client";

import { useContext } from "react";
import { AuthContext } from "./auth-context";
import type { AuthState } from "./auth-types";

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
