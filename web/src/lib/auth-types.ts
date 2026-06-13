// web/src/lib/auth-types.ts — the frozen contract. Both tracks import this type.
export interface AuthState {
  address: `0x${string}` | null;
  isConnected: boolean;
  isVerified: boolean;
  login(): Promise<void>;
  logout(): Promise<void>;
  verify(): Promise<boolean>;
  getWalletClient(): Promise<import("viem").WalletClient | null>;
}
