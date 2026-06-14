"use client";

import { type ReactNode } from "react";
import { AuthContext } from "./auth-context";
import type { AuthState } from "./auth-types";

const DEMO_ADDRESS = "0x1111111111111111111111111111111111111111" as const;

const mockAuthState: AuthState = {
  address: DEMO_ADDRESS,
  isConnected: true,
  isVerified: true,
  async login() {},
  async logout() {},
  async verify() { return true; },
  async getWalletClient() { return null; },
};

export function MockAuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={mockAuthState}>{children}</AuthContext.Provider>
  );
}
