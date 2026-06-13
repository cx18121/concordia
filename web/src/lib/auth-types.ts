import type { WalletClient } from "viem";

/**
 * The frozen identity + wallet contract Track B consumes.
 * Do NOT change names or signatures without telling Track B — this is frozen like the ABIs.
 */
export interface AuthState {
  address: `0x${string}` | null;
  isConnected: boolean;
  isVerified: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  verify: () => Promise<boolean>;
  getWalletClient: () => Promise<WalletClient | null>;
}
