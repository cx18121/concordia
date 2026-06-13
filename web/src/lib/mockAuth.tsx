"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AuthState } from "./auth-types";

// Fixed demo identity so UI that shows a wallet/verification has something to render.
// The mock sends no real transactions, so getWalletClient resolves to null.
const DEMO_ADDRESS = "0x1111111111111111111111111111111111111111" as const;

const mockAuthState: AuthState = {
  address: DEMO_ADDRESS,
  isConnected: true,
  isVerified: true,
  async login() {},
  async logout() {},
  async verify() {
    return true;
  },
  async getWalletClient() {
    return null;
  },
};

// Default value == mock so outside-provider calls degrade gracefully, not throw.
const AuthContext = createContext<AuthState>(mockAuthState);

export function MockAuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={mockAuthState}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
