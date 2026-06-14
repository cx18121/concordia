"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type RefObject,
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

// Verification bypass is a local-dev convenience only. Demo/mock mode bypasses
// via MockAuthProvider; deployed live mode (production or preview) must always run
// real World ID, so this is gated to non-production builds and can never take
// effect on a Vercel deploy even if the env var is set.
const DEV_BYPASS =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_DEV_BYPASS === "true";

const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
if (!environmentId || environmentId === "REPLACE_ME") {
  console.warn(
    "[AuthProvider] NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not set — Dynamic login will not work.",
  );
}

/** Maps Dynamic's context to the frozen AuthState and layers verification state on top. */
function AuthBridge({
  children,
  loginResolve,
}: {
  children: ReactNode;
  // Resolved by the provider's onAuthFlowClose when the Dynamic modal closes
  // (success or cancel), so login() can await the modal instead of returning
  // the instant it opens.
  loginResolve: RefObject<(() => void) | null>;
}) {
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
    if (address) return; // already connected — nothing to wait for
    setShowAuthFlow(true);
    // Resolve only when the modal closes (onAuthFlowClose), so the caller can't
    // advance its UI just because the modal opened. Cancel resolves it too — the
    // caller then sees isConnected is still false and stays put.
    await new Promise<void>((resolve) => {
      loginResolve.current = resolve;
    });
  }, [address, setShowAuthFlow, loginResolve]);

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
  // Bridges Dynamic's onAuthFlowClose back to the login() promise in AuthBridge.
  const loginResolve = useRef<(() => void) | null>(null);
  return (
    <DynamicContextProvider
      settings={{
        // Non-empty fallback so the app still builds without a .env.local (a fresh
        // clone). Dynamic throws on an empty environmentId; login just won't work
        // until a real id is set (see the warning above).
        environmentId: environmentId || "MISSING_DYNAMIC_ENV_ID",
        walletConnectors: [EthereumWalletConnectors],
        events: {
          // Fires whenever the auth modal closes (success or cancel). Unblocks login().
          onAuthFlowClose: () => {
            loginResolve.current?.();
            loginResolve.current = null;
          },
        },
      }}
    >
      <AuthBridge loginResolve={loginResolve}>{children}</AuthBridge>
    </DynamicContextProvider>
  );
}

