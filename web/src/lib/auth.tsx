"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DynamicContextProvider,
  useDynamicContext,
} from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors, isEthereumWallet } from "@dynamic-labs/ethereum";
import type { WalletClient } from "viem";
import type { AuthState } from "./auth-types";

// Base Sepolia + "create embedded wallet on login" are enabled in the Dynamic
// dashboard (Embedded Wallet → "Create on Sign up"), not as provider props.
// Plain EOA embedded wallet — gas sponsorship / account abstraction is deferred.
const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? "";

const AuthContext = createContext<AuthState | null>(null);

/** Maps Dynamic's context to the frozen AuthState and layers verification state on top. */
function AuthBridge({ children }: { children: ReactNode }) {
  const { primaryWallet, setShowAuthFlow, handleLogOut } = useDynamicContext();

  // A4: World ID verification flips this. Keep the state here so A4 only has to
  // wire verify() to the IDKit flow + /api/verify and call setIsVerified(true).
  const [isVerified, setIsVerified] = useState(false);

  const address =
    primaryWallet && isEthereumWallet(primaryWallet)
      ? (primaryWallet.address as `0x${string}`)
      : null;

  const login = useCallback(async () => {
    setShowAuthFlow(true);
  }, [setShowAuthFlow]);

  const logout = useCallback(async () => {
    await handleLogOut();
    setIsVerified(false);
  }, [handleLogOut]);

  const verify = useCallback(async (): Promise<boolean> => {
    // A4: trigger the World ID IDKit flow (WorldIDVerify), POST to /api/verify,
    // and on success call setIsVerified(true) and return true.
    return false;
  }, []);

  const getWalletClient = useCallback(async (): Promise<WalletClient | null> => {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) return null;
    return primaryWallet.getWalletClient();
  }, [primaryWallet]);

  const value = useMemo<AuthState>(
    () => ({
      address,
      isConnected: address !== null,
      isVerified,
      login,
      logout,
      verify,
      getWalletClient,
    }),
    [address, isVerified, login, logout, verify, getWalletClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      <AuthBridge>{children}</AuthBridge>
    </DynamicContextProvider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
