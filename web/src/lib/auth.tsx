"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
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
import WorldIDVerify from "@/components/WorldIDVerify";

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_BYPASS === "true";

// Base Sepolia + "create embedded wallet on login" are enabled in the Dynamic
// dashboard (Embedded Wallet → "Create on Sign up"), not as provider props.
// Plain EOA embedded wallet — gas sponsorship / account abstraction is deferred.
const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
if (!environmentId || environmentId === "REPLACE_ME") {
  console.warn(
    "[AuthProvider] NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not set — Dynamic login will not work.",
  );
}

const AuthContext = createContext<AuthState | null>(null);

/** Maps Dynamic's context to the frozen AuthState and layers verification state on top. */
function AuthBridge({ children }: { children: ReactNode }) {
  const { primaryWallet, setShowAuthFlow, handleLogOut } = useDynamicContext();

  // World ID verification flips this. logout() resets it.
  const [isVerified, setIsVerified] = useState(false);

  // verify() drives the World ID flow by rendering <WorldIDVerify/> (a component,
  // not a callable). verifying gates the render; pendingResolve bridges the
  // component's onVerified callback back to the verify() promise.
  const [verifying, setVerifying] = useState(false);
  const pendingResolve = useRef<((ok: boolean) => void) | null>(null);

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
    // Demo escape hatch: flip verified without a real proof.
    if (DEV_BYPASS) {
      setIsVerified(true);
      return true;
    }
    // Render <WorldIDVerify/> and resolve once its onVerified fires.
    return new Promise<boolean>((resolve) => {
      pendingResolve.current = resolve;
      setVerifying(true);
    });
  }, []);

  const onVerified = useCallback(() => {
    setIsVerified(true);
    setVerifying(false);
    pendingResolve.current?.(true);
    pendingResolve.current = null;
  }, []);

  const getWalletClient = useCallback(async (): Promise<WalletClient | null> => {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) return null;
    try {
      return await primaryWallet.getWalletClient();
    } catch {
      return null;
    }
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

  return (
    <AuthContext.Provider value={value}>
      {children}
      {verifying && <WorldIDVerify signal={address ?? ""} onVerified={onVerified} />}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: environmentId ?? "",
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
