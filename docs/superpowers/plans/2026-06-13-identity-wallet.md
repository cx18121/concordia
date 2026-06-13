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

- [ ] Create a Dynamic project in the Dynamic dashboard; enable **email login** and **embedded wallets** on **Base Sepolia**. Copy the environment ID. _(human step — needs dashboard access; `.env.local` has a `REPLACE_ME` placeholder. Embedded-wallet-on-login = dashboard "Create on Sign up" toggle; Base Sepolia enabled dashboard-side, not as a provider prop.)_
- [x] Install the Dynamic React SDK + connectors. `@dynamic-labs/sdk-react-core` + `@dynamic-labs/ethereum` (`EthereumWalletConnectors`) `@4.88.6`, `viem@2.52.2`, via `npm install`. No peer-dep workaround needed (React 19 / Next 16 OK).
- [x] Wrap the app in Dynamic's provider inside `layout.tsx` (client boundary `AuthProvider` in `web/src/lib/auth.tsx`). Plain EOA — no AA.
- [ ] **Verify:** `npm run dev`, load `/`, trigger Dynamic's login modal — confirm email login creates a wallet. _(needs a real env ID; not done. Verified instead: install + typecheck + build + `/` renders HTTP 200 on the placeholder ID without the provider crashing.)_

---

### Task A2: `AuthProvider` + `useAuth()` over Dynamic

**Files:**
- Create: `web/src/lib/auth.ts` (the contract + implementation, or split impl into `auth.tsx` if JSX needed)

- [x] Implement `AuthProvider` wrapping Dynamic's context, and `useAuth()` returning the frozen `AuthState`. (Frozen type in `web/src/lib/auth-types.ts`; impl in `web/src/lib/auth.tsx`; stable re-export `web/src/lib/useAuth.ts`.)
- [x] Map Dynamic → interface: `address`/`isConnected` from `primaryWallet` (guarded by `isEthereumWallet`); `login` = `setShowAuthFlow(true)`; `logout` = `handleLogOut()`; `getWalletClient()` = `primaryWallet.getWalletClient()` (viem `WalletClient`, confirmed in Dynamic docs).
- [x] Leave `isVerified`/`verify` as stubs for now (`isVerified: false`, `verify` returns false) — filled in A4. State lives in context so A4 only flips it; `// A4:` markers left in code.
- [ ] **Verify:** add a temporary `/debug` page that prints `useAuth()` state; log in; confirm `address` + `isConnected` populate and `getWalletClient()` returns a client. _(needs a real env ID to log in; not done. Typecheck confirms `useAuth`/`AuthProvider` satisfy the frozen interface.)_

---

### Task A3: Sponsored gas (no ETH for the judge)

> **DEFERRED** (spike decision): gas sponsorship is out of scope for now — `getWalletClient()` returns a plain embedded **EOA** on Base Sepolia, no ZeroDev / AA / smart-wallet connectors. Sponsorship is additive later and does not change the frozen `AuthState` interface. Boxes left unchecked on purpose.

**Files:**
- Modify: Dynamic dashboard config + `web/src/lib/auth.ts` if a paymaster/AA flag is needed

- [ ] ~~In Dynamic, enable gas sponsorship / account abstraction for Base Sepolia~~ — deferred.
- [ ] ~~Confirm `getWalletClient()` returns the smart/sponsored account~~ — deferred; returns a bare EOA by design for now.
- [ ] ~~Verify a zero-ETH tx lands~~ — deferred.

---

### Task A4: World ID verification into `useAuth().verify()`

**Files:**
- Modify: `web/src/components/WorldIDVerify.tsx` (exists)
- Modify: `web/src/lib/auth.ts`
- Uses (already built): `web/src/app/api/rp-signature/route.ts`, `web/src/app/api/verify/route.ts`
- Create: env vars `WORLD_RP_ID`, `RP_SIGNING_KEY` in `web/.env.local`

- [x] Set up a World ID app/RP; put `WORLD_RP_ID` + `RP_SIGNING_KEY` in `.env.local`. Request level `selfieCheckLegacy` with `allow_legacy_proofs: true` (NOT `orb`) — per `docs/ROADMAP.md`. (Placeholders + comments added to gitignored `.env.local`; real values need a human with World dashboard creds.)
- [x] Pass the **Dynamic wallet address as the IDKit `signal`** so the proof binds to the wallet. (idkit v4 has no widget `signal` prop — it's passed to the preset: `deviceLegacy({ signal })`. `WorldIDVerify` now takes a `signal` prop; `AuthBridge` passes `address`.)
- [x] Implement `verify()`: trigger the IDKit flow (reuse `WorldIDVerify`), POST to `/api/verify`; on success set `isVerified = true` in context. Honor the existing `NEXT_PUBLIC_DEV_BYPASS=true` escape hatch for clicking through without a real proof.
- [x] **Verify:** run the flow end-to-end (or with `DEV_BYPASS`); confirm `useAuth().isVerified` flips to `true` and a second attempt with the same nullifier is rejected by `/api/verify` (409). (DEV_BYPASS path verified at runtime: false→true. 409 dedup is implemented in `/api/verify` `usedNullifiers` Set; verified-at-live-flip once RP creds are added.)

---

### Task A5: Hand off the contract to Track B

- [x] Confirm the lib exports exactly the frozen `AuthProvider` + `useAuth()`. Public surface (impl is `auth.tsx`, not `auth.ts`):
  - `web/src/lib/useAuth.ts` — `export { useAuth, AuthProvider } from "./auth"` + `export type { AuthState }`. **This is Track B's import path.**
  - `web/src/lib/auth-types.ts` — the frozen `AuthState` interface, byte-for-byte the agreed shape. Unchanged.
- [x] Track B swap instructions documented below (their `MockAuthProvider` → real `AuthProvider`).
- [ ] **Verify with Track B's real provider:** can't run here — Track B lives in its own branch/worktree against a mock. Verified on this side: `tsc` clean, `npm run build` green, the frozen interface is satisfied, and the `useAuth()` re-export path is stable. Final login→verify→deposit verification happens at integration once Dynamic + World RP creds are in `.env.local`.

#### Track B handoff

**Import unchanged:** `import { AuthProvider, useAuth, type AuthState } from "@/lib/useAuth";`

**The swap:** in `web/src/app/layout.tsx` (or wherever the mock is mounted), replace your `MockAuthProvider` with the real `AuthProvider` from `@/lib/useAuth`. No call-site changes — `useAuth()` returns the same `AuthState` shape (`address`, `isConnected`, `isVerified`, `login`, `logout`, `verify`, `getWalletClient`). The real `AuthProvider` is already wired into `layout.tsx` on this branch.

**Env before the real flow works** (`web/.env.local`, gitignored — placeholders are in place):
- `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` — Dynamic dashboard (email login + embedded wallets on Base Sepolia).
- `WORLD_RP_ID`, `RP_SIGNING_KEY`, `NEXT_PUBLIC_WORLD_APP_ID`, `NEXT_PUBLIC_WORLD_ACTION` — World Developer Portal (level `selfieCheckLegacy`, `allow_legacy_proofs: true`).
- `NEXT_PUBLIC_DEV_BYPASS=true` — keep on to click through verify() without a real World proof.

**Two things to know:**
- **Gas:** wallets are plain EOAs (sponsorship deferred). On a testnet the judge's fresh wallet needs a small test-ETH drip to send txs — a ~10-line backend step to add at live-flip, no interface change. (True gasless = the ZeroDev/AA route, deferred to polish; it would change the user's address to a smart account, which is why it's not in v1.)
- **verify():** `await verify()` resolves `true` on success / `false` on cancel/dismiss/failure (no hanging promise). With `DEV_BYPASS=true` it resolves `true` immediately. It returns `false` if no wallet is connected, so call `login()` first.

---

## Done when
Email login creates a gas-sponsored embedded wallet on Base Sepolia; World ID verification flips `isVerified`; `useAuth()` matches the frozen contract; Track B drops in the real provider with zero code changes.
