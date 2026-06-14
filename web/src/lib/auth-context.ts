"use client";

import { createContext } from "react";
import type { AuthState } from "./auth-types";

// Shared context lives here so useAuth.ts can read it without importing
// auth.tsx (which pulls in @dynamic-labs/ethereum → WalletConnect → crashes
// on Node 25 during SSR). Both MockAuthProvider and AuthProvider write to this.

const MOCK_DEFAULT: AuthState = {
  address: "0x1111111111111111111111111111111111111111",
  isConnected: true,
  isVerified: true,
  async login() {},
  async logout() {},
  async verify() { return true; },
  async getWalletClient() { return null; },
};

export const AuthContext = createContext<AuthState>(MOCK_DEFAULT);
