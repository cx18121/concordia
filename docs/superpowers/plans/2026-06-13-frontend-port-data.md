# Frontend Port + Data Layer — Implementation Plan (Track B)

> **For agentic workers:** Implement task-by-task; check boxes as you go. Hackathon mode: verify by **running the demo path and clicking through it**, not unit-testing visual porting. Reuse the mockups' CSS verbatim — do not rewrite to Tailwind, do not Reactify animations.

**Goal:** Port the 6 `redesign/mockups/` pages into one Next.js SPA with a shared nav shell, wire the demo-path screens (Overview, Join, Vote) to a mock→live data layer, and consume Track A's `useAuth()` for identity/wallet.

**Architecture:** One Next.js App Router app. The mockups' markup + CSS move into components verbatim; the cinematic Overview's animation JS runs imperatively in a `useEffect`. All chain access goes through `lib/data.ts`, a thin switch between a mock adapter (seeded data) and a live adapter (`@concordia/shared` over viem). Identity/wallet come from Track A's frozen `useAuth()`; until A lands, a `MockAuthProvider` implements the same interface.

**Tech Stack:** Next.js (App Router), plain CSS (from mocks), viem, `@concordia/shared`.

**Source mockups:** `redesign/mockups/{cinematic,vote,account,stitch-leaderboard,stitch-settings}.html`, `shell.css`, `shell.js`.

**Interface dependency (frozen, owned by Track A):**
```ts
// web/src/lib/auth-types.ts  — the frozen contract. Both tracks import this type.
export interface AuthState {
  address: `0x${string}` | null; isConnected: boolean; isVerified: boolean;
  login(): Promise<void>; logout(): Promise<void>; verify(): Promise<boolean>;
  getWalletClient(): Promise<import("viem").WalletClient | null>;
}
```
- Track A implements `AuthProvider` + `useAuth` in `web/src/lib/auth.tsx`.
- Track B implements `MockAuthProvider` + a mock `useAuth` in `web/src/lib/mockAuth.tsx`.
- **Pages import `useAuth` from a single re-export** `web/src/lib/useAuth.ts` that points at mock or real — swapping providers is then a **one-line change** in that file + `layout.tsx`, not an edit to every page.

---

## Setup notes & corrections (read before starting — found in plan review)

`web/` currently has **no `viem`** and **cannot resolve `@concordia/shared`** (no workspace link; `tsconfig` only maps `@/*`). So:

1. **Add `viem` to `web/`** in Task B1 (`npm install viem` in `web/`). It's needed for the `AuthState` type and for live mode. The mock adapter does **not** call it.
2. **Do NOT import `@concordia/shared` in mock mode.** Define the small UI-facing types (`Cycle`, `Pick`, `Alloc`, position, leaderboard row) **locally** in `lib/data.ts`. In mock, `getWalletClient()` returns `null` — the mock UI sends no real transactions.
3. **Defer the `@concordia/shared` wiring to the live step (B7).** When going live, add a `tsconfig` path alias `"@concordia/shared": ["../../shared/src"]` (verify the relative depth) and have the live adapter import the real helpers. Contracts are already deployed — `shared/src/addresses.ts` is filled in — so live mode is real when you flip it.

This keeps all of B0–B6 buildable with zero workspace setup.

---

### Task B0: `MockAuthProvider` so we never block on Track A

**Files:**
- Create: `web/src/lib/auth-types.ts` (the frozen `AuthState` interface — whoever lands first creates it)
- Create: `web/src/lib/mockAuth.tsx`
- Create: `web/src/lib/useAuth.ts` (single re-export the pages import; points at mock for now)

- [x] Put the frozen `AuthState` interface in `auth-types.ts`.
- [x] Implement `MockAuthProvider` + a mock `useAuth()` in `mockAuth.tsx`: `address` = a fixed demo address, `isConnected: true`, `isVerified: true`, `login/logout/verify` resolve immediately, `getWalletClient()` returns `null` (mock sends no real txs). No `@concordia/shared` or `viem` calls.
- [x] `useAuth.ts` re-exports the mock `useAuth`. Pages import only from `@/lib/useAuth`, so swapping to Track A's real provider is a one-line change here + in `layout.tsx`.
- [x] **Verify:** a component calling `useAuth()` renders with the stub values.

---

### Task B1: App shell — global CSS, `<Nav>`, providers, routes

**Files:**
- Create: `web/src/styles/shell.css` (copy `redesign/mockups/shell.css` verbatim)
- Create: `web/src/components/Nav.tsx` (port `redesign/mockups/shell.js`)
- Modify: `web/src/app/layout.tsx` (import shell.css + global fonts; wrap in `MockAuthProvider`; render `<Nav>`)
- Create: empty route pages `web/src/app/{vote,leaderboard,account,settings}/page.tsx`

- [x] `npm install viem` in `web/` (needed for the `AuthState` type and live mode).
- [x] Copy `shell.css` into `web/src/styles/` and import it in `layout.tsx`. Add the Google Fonts `<link>` (Inter, Outfit) the mocks use, in `layout.tsx`.
- [x] Port `shell.js` into `<Nav>`: it just builds the nav markup (brand, tabs, wallet balance, gear). Replace `location.href` navigation with Next `<Link>`. Keep the `countUp` helper as a small util (used by data-bound numbers).
- [x] Wrap children in `MockAuthProvider` in `layout.tsx`.
- [x] Create placeholder route pages so the nav tabs resolve.
- [x] **Verify:** `npm run dev`; nav renders on every route, tabs navigate, no console errors.

---

### Task B2: `lib/data.ts` — the mock→live seam

**Files:**
- Create: `web/src/lib/data.ts`

- [x] Define the hooks the UI binds to: `useCycle()`, `usePrices()`, `usePosition()`, `useVotingPower()`, `useAccuracy()`, `useLeaderboard()`, and write actions `getDemoUSDC()`, `deposit(amount)`, `castVote(allocs)`, `claim()`. Types mirror `@concordia/shared` (`Cycle`, `Pick`, `Alloc`).
- [x] Implement a **mock adapter**: seeded, realistic values (a cycle in `OPEN` with a countdown, ~8 tickers with prices, a sample position + NAV, a leaderboard). Write actions mutate local React state and resolve.
- [x] Include a `resolveCycle()` dev trigger in the mock adapter that flips the cycle to resolved, updates NAV from the new prices, and sets a sample `useAccuracy()` score — this drives the demo's "watch the cycle resolve → accuracy appears → claim" beat without real contracts. (A button/keypress wires it in B5.)
- [x] Implement a **live adapter** (STUB per Setup notes — structured + B7 wiring map, throws until B7 wires `@concordia/shared`): calls `@concordia/shared` (`getCycle`, `getPrices`, `getVotingPower`, `castVote`, etc.) via `publicClient()`; writes use `useAuth().getWalletClient()`.
- [x] Switch on `process.env.NEXT_PUBLIC_USE_MOCK` (default `true`).
- [x] **Verify:** a temp page printing the hooks shows mock data; flipping the env (with real addresses) is the only change needed later.

---

### Task B3: Port Overview `/` (public, animated, mock data)

**Files:**
- Modify: `web/src/app/page.tsx` (replace the current World-ID-only page)
- Create: `web/src/styles/overview.css` (the cinematic page's inline `<style>`, copied)
- Create: `web/src/components/Overview.tsx` (`"use client"`)

- [x] Move `cinematic.html`'s `<style>` block into `overview.css`; paste its markup into `Overview.tsx` (`class`→`className`).
- [x] Run the cinematic animation JS **imperatively** inside a `useEffect` (drag-scrub, morph, SVG chartfield). Do not rewrite it in React.
- [x] Bind the headline numbers (NAV, return, countdown) to `useCycle()`/`usePosition()` via the `countUp` util. Page is **public** — no login required to view. (Countdown→`useCycle().secondsLeft`; position chip→`usePosition()`; hero NAV/return kept as the fund's seeded series per design.)
- [x] Add a **Join** button that calls `useAuth().login()` then `.verify()`, then reveals the deposit step (Task B4).
- [x] **Verify:** `/` loads without login, animates correctly, shows mock NAV/countdown; Join button advances to verify. (Headless: 200 + markup + clean hydration verified; animation needs eyes-on rehearsal.)

---

### Task B4: Join flow — get-USDC + deposit (mock)

**Files:**
- Create: `web/src/components/JoinFlow.tsx`

- [x] After `useAuth().isVerified` is true, show **Get demo USDC** (`getDemoUSDC()`) and **Deposit** (`deposit(amount)`).
- [x] On deposit, update `usePosition()` (mock) so the Overview reflects new shares/NAV.
- [x] **Verify:** click Join → (mock) verify → get USDC → deposit; confirm position/NAV update on Overview. (Wired + type-checked; click-through to be confirmed in end-to-end browser rehearsal.)

---

### Task B5: Port Vote `/vote` (mock data + mock castVote)

**Files:**
- Modify: `web/src/app/vote/page.tsx`
- Create: `web/src/styles/vote.css` (from `vote.html`)

- [x] Port `vote.html` markup + CSS. Bind the stock list to `usePrices()`/`UNIVERSE`; allocation control updates local state.
- [x] **Submit** calls `castVote(allocs)` (mock); show a confirmation + the cycle countdown from `useCycle()`. Gate submit behind `useAuth().isVerified` (or redirect to Join).
- [x] After submit, expose a way to fire the mock `resolveCycle()` (a demo-only "resolve now" button or keypress) so the post-vote beat shows: cycle resolves → `useAccuracy()` score appears → `claim()` becomes available on Overview/Account.
- [x] **Verify:** allocate across tickers, submit, see confirmation; weights normalize correctly; trigger resolve and confirm accuracy + claim appear. (Wired + type-checked + 200/markup verified; slider/submit/resolve clicks pending browser rehearsal.)

---

### Task B6: Port secondary pages (mock content)

**Files:**
- Modify: `web/src/app/leaderboard/page.tsx` (+ `leaderboard.css` from `stitch-leaderboard.html`)
- Modify: `web/src/app/account/page.tsx` (+ `account.css` from `account.html`)
- Modify: `web/src/app/settings/page.tsx` (+ `settings.css` from `stitch-settings.html`)

- [ ] Mechanical paste of each page's markup + CSS into its route. Bind only trivially (leaderboard → `useLeaderboard()` mock); account/settings can render static mock content.
- [ ] **Verify:** each page renders inside the shared shell with correct styling; nav highlights the active tab.

---

### Task B7: Live-flip checklist (after contracts deploy — M2)

- [ ] `shared/src/addresses.ts` is already filled with deployed Base Sepolia addresses (done — just ensure it's committed).
- [ ] Add `tsconfig` path alias `"@concordia/shared": ["../../shared/src"]` (verify relative depth) so the live adapter can import the real helpers.
- [ ] Implement the live adapter in `lib/data.ts` against `@concordia/shared` (`getCycle`, `getPrices`, `castVote`, …); writes use `useAuth().getWalletClient()`.
- [ ] Set `NEXT_PUBLIC_USE_MOCK=false`.
- [ ] Point `web/src/lib/useAuth.ts` + `layout.tsx` at Track A's real `AuthProvider` (one-line swap).
- [ ] **Verify:** Overview reads live NAV/cycle; deposit + castVote send real Base Sepolia txs via the sponsored wallet; World ID marks the wallet verified.

---

## Done when
All 6 pages render in one consistent shell; the demo path (land → Join → verify → get USDC → deposit → vote) runs end-to-end on mock data; flipping to live is the env + provider swap in B7, with no component rewrites.
