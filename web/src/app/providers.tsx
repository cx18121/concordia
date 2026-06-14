"use client";

import dynamic from "next/dynamic";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";

const envId = process.env.NEXT_PUBLIC_DYNAMIC_ENV_ID;

// Dynamic SDK uses localStorage at module load time (via WalletConnect) — must be
// client-only; ssr:false prevents the SSR pass from touching it.
const DynamicContextProvider = dynamic(
  () =>
    import("@dynamic-labs/sdk-react-core").then((m) => m.DynamicContextProvider),
  { ssr: false }
);

function DynamicProviders({ children }: { children: React.ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: envId!,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  if (!envId) return <>{children}</>;
  return <DynamicProviders>{children}</DynamicProviders>;
}
