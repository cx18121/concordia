# Identity & Wallet — Implementation Plan (Track A)

> **For agentic workers:** Implement task-by-task; check boxes as you go. Hackathon mode: verify by **running the flow**, not unit-testing visual/SDK glue. Don't code Dynamic from memory — open the docs (links in each task).

**Goal:** Give the app a single `useAuth()` contract backed by Dynamic (email login + embedded wallet + sponsored gas) and World ID verification, so Track B can gate actions and sign transactions without knowing how identity works.

**Architecture:** One React context (`AuthProvider`) wraps the app. It composes Dynamic (auth + embedded wallet) and World ID IDKit (proof of personhood). It exposes the frozen `AuthState` interface. Track B consumes only that interface.

**Tech Stack:** Next.js (App Router), Dynamic (`@dynamic-labs/*`), World ID IDKit (`@worldcoin/idkit`, already installed), viem.

**Docs (read before coding):**
- Dynamic React SDK + agents/server wallets: https://www.dynamic.xyz/docs
- Dynamic gas sponsorship / smart wallets: https://www.dynamic.xyz/docs (search "gas sponsorship" / "account abstraction")
- World ID: https://docs.world.org/world-id/overview

---

## The frozen contract (deliver this exact shape — Track B depends on it)

```ts
// web/src/lib/auth.ts
import type { ReactNode } from "react";
import type { WalletClient } from "viem";

export interface AuthState {
  address: `0x${string}` | null;
  isConnected: boolean;
  isVerified: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  verify: () => Promise<boolean>;
  getWalletClient: () => Promise<WalletClient | null>;
}

export function useAuth(): AuthState;
export function AuthProvider(props: { children: ReactNode }): JSX.Element;
```

Do not change names or signatures without telling Track B — this is frozen like the ABIs.

---

### Task A1: Dynamic project + provider wired into the app

**Files:**
- Modify: `web/src/app/layout.tsx`
- Create: `web/.env.local` (gitignored) with `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=...`
- Modify: `web/package.json` (deps)

- [ ] Create a Dynamic project in the Dynamic dashboard; enable **email login** and **embedded wallets** on **Base Sepolia**. Copy the environment ID.
- [ ] Install the Dynamic React SDK + connectors (check docs for current package set; as of the docs it's `@dynamic-labs/sdk-react-core` plus an EVM connector). Use `npm install` in `web/` (this app is npm, not bun).
- [ ] Wrap the app in Dynamic's provider inside `layout.tsx` (a client boundary). Configure: Base Sepolia, embedded-wallet-on-login.
- [ ] **Verify:** `npm run dev`, load `/`, trigger Dynamic's login modal — confirm email login creates a wallet. Quote the resulting address.

---

### Task A2: `AuthProvider` + `useAuth()` over Dynamic

**Files:**
- Create: `web/src/lib/auth.ts` (the contract + implementation, or split impl into `auth.tsx` if JSX needed)

- [ ] Implement `AuthProvider` wrapping Dynamic's context, and `useAuth()` returning the frozen `AuthState`.
- [ ] Map Dynamic → interface: `address`/`isConnected` from Dynamic's user/wallet; `login`/`logout` call Dynamic's methods; `getWalletClient()` returns a viem `WalletClient` from Dynamic's embedded wallet (Dynamic exposes a viem wallet client — confirm the exact accessor in docs).
- [ ] Leave `isVerified`/`verify` as stubs for now (`isVerified: false`, `verify` returns false) — filled in A4.
- [ ] **Verify:** add a temporary `/debug` page that prints `useAuth()` state; log in; confirm `address` + `isConnected` populate and `getWalletClient()` returns a client. Delete `/debug` after.

---

### Task A3: Sponsored gas (no ETH for the judge)

**Files:**
- Modify: Dynamic dashboard config + `web/src/lib/auth.ts` if a paymaster/AA flag is needed

- [ ] In Dynamic, enable gas sponsorship / account abstraction for Base Sepolia so embedded-wallet txs need no ETH (follow Dynamic's gas-sponsorship guide).
- [ ] Confirm `getWalletClient()` returns the smart/sponsored account, not a bare EOA.
- [ ] **Verify (best-effort in mock phase):** once any real tx path exists (Track B live mode, or a throwaway test tx to mock USDC), send one from a fresh email account with zero ETH and confirm it lands. If contracts aren't deployed yet, document that this is verified at live-flip and note the dashboard settings used.

---

### Task A4: World ID verification into `useAuth().verify()`

**Files:**
- Modify: `web/src/components/WorldIDVerify.tsx` (exists)
- Modify: `web/src/lib/auth.ts`
- Uses (already built): `web/src/app/api/rp-signature/route.ts`, `web/src/app/api/verify/route.ts`
- Create: env vars `WORLD_RP_ID`, `RP_SIGNING_KEY` in `web/.env.local`

- [ ] Set up a World ID app/RP; put `WORLD_RP_ID` + `RP_SIGNING_KEY` in `.env.local`. Request level `selfieCheckLegacy` with `allow_legacy_proofs: true` (NOT `orb`) — per `docs/ROADMAP.md`.
- [ ] Pass the **Dynamic wallet address as the IDKit `signal`** so the proof binds to the wallet.
- [ ] Implement `verify()`: trigger the IDKit flow (reuse `WorldIDVerify`), POST to `/api/verify`; on success set `isVerified = true` in context. Honor the existing `NEXT_PUBLIC_DEV_BYPASS=true` escape hatch for clicking through without a real proof.
- [ ] **Verify:** run the flow end-to-end (or with `DEV_BYPASS`); confirm `useAuth().isVerified` flips to `true` and a second attempt with the same nullifier is rejected by `/api/verify` (409).

---

### Task A5: Hand off the contract to Track B

- [ ] Confirm `web/src/lib/auth.ts` exports exactly the frozen `AuthProvider` + `useAuth()`.
- [ ] Tell Track B to swap their `MockAuthProvider` import for the real `AuthProvider` in `layout.tsx`.
- [ ] **Verify:** with the real provider in place, Track B's Join button runs login → verify → (their deposit step) with no interface changes on their side.

---

## Done when
Email login creates a gas-sponsored embedded wallet on Base Sepolia; World ID verification flips `isVerified`; `useAuth()` matches the frozen contract; Track B drops in the real provider with zero code changes.
