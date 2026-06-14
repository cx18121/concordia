"use client";

import {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AuthContext } from "./auth-context";
import {
  DynamicContextProvider,
  useDynamicContext,
} from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors, isEthereumWallet } from "@dynamic-labs/ethereum";
import type { WalletClient } from "viem";
import type { AuthState } from "./auth-types";
import WorldIDVerify from "@/components/WorldIDVerify";

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_BYPASS === "true";

const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
if (!environmentId || environmentId === "REPLACE_ME") {
  console.warn(
    "[AuthProvider] NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not set — Dynamic login will not work.",
  );
}

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
    // Re-entry guard: a flow is already live; don't clobber its resolver.
    if (pendingResolve.current) return false;
    // No wallet → the proof would carry no signal and wouldn't bind to the wallet.
    if (!address) {
      console.warn("[verify] no wallet address — connect a wallet before verifying");
      return false;
    }
    // Render <WorldIDVerify/> and resolve once its onVerified / onCancel fires.
    return new Promise<boolean>((resolve) => {
      pendingResolve.current = resolve;
      setVerifying(true);
    });
  }, [address]);

  const onVerified = useCallback(() => {
    setIsVerified(true);
    setVerifying(false);
    pendingResolve.current?.(true);
    pendingResolve.current = null;
  }, []);

  // Modal dismissed or proof failed: unblock the caller without verifying.
  const onCancel = useCallback(() => {
    setVerifying(false);
    pendingResolve.current?.(false);
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
      {verifying && (
        <WorldIDVerify autoStart signal={address ?? ""} onVerified={onVerified} onCancel={onCancel} />
      )}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        // Non-empty fallback so the app still builds without a .env.local (a fresh
        // clone). Dynamic throws on an empty environmentId; login just won't work
        // until a real id is set (see the warning above).
        environmentId: environmentId || "MISSING_DYNAMIC_ENV_ID",
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      <AuthBridge>{children}</AuthBridge>
    </DynamicContextProvider>
  );
}

