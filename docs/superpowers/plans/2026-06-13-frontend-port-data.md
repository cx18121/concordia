# Frontend Port + Data Layer — Implementation Plan (Track B)

> **For agentic workers:** Implement task-by-task; check boxes as you go. Hackathon mode: verify by **running the demo path and clicking through it**, not unit-testing visual porting. Reuse the mockups' CSS verbatim — do not rewrite to Tailwind, do not Reactify animations.

**Goal:** Port the 6 `redesign/mockups/` pages into one Next.js SPA with a shared nav shell, wire the demo-path screens (Overview, Join, Vote) to a mock→live data layer, and consume Track A's `useAuth()` for identity/wallet.

**Architecture:** One Next.js App Router app. The mockups' markup + CSS move into components verbatim; the cinematic Overview's animation JS runs imperatively in a `useEffect`. All chain access goes through `lib/data.ts`, a thin switch between a mock adapter (seeded data) and a live adapter (`@concordia/shared` over viem). Identity/wallet come from Track A's frozen `useAuth()`; until A lands, a `MockAuthProvider` implements the same interface.

**Tech Stack:** Next.js (App Router), plain CSS (from mocks), viem, `@concordia/shared`.

**Source mockups:** `redesign/mockups/{cinematic,vote,account,stitch-leaderboard,stitch-settings}.html`, `shell.css`, `shell.js`.

**Interface dependency (frozen, owned by Track A):**
```ts
// web/src/lib/auth.ts
export interface AuthState {
  address: `0x${string}` | null; isConnected: boolean; isVerified: boolean;
  login(): Promise<void>; logout(): Promise<void>; verify(): Promise<boolean>;
  getWalletClient(): Promise<import("viem").WalletClient | null>;
}
export function useAuth(): AuthState;
export function AuthProvider(props: { children: import("react").ReactNode }): JSX.Element;
```

---

### Task B0: `MockAuthProvider` so we never block on Track A

**Files:**
- Create: `web/src/lib/mockAuth.tsx`

- [ ] Implement `MockAuthProvider` + a `useAuth()` matching the frozen `AuthState`: `address` = a fixed demo address, `isConnected: true`, `isVerified: true`, `login/logout/verify` resolve immediately, `getWalletClient()` returns a viem client via `@concordia/shared`'s `walletClientFromKey(<demo key from env>)`.
- [ ] Export it behind the same import path Track B uses everywhere, so swapping to Track A's real `AuthProvider` is a one-line change in `layout.tsx`.
- [ ] **Verify:** a component calling `useAuth()` renders with the stub values.

---

### Task B1: App shell — global CSS, `<Nav>`, providers, routes

**Files:**
- Create: `web/src/styles/shell.css` (copy `redesign/mockups/shell.css` verbatim)
- Create: `web/src/components/Nav.tsx` (port `redesign/mockups/shell.js`)
- Modify: `web/src/app/layout.tsx` (import shell.css + global fonts; wrap in `MockAuthProvider`; render `<Nav>`)
- Create: empty route pages `web/src/app/{vote,leaderboard,account,settings}/page.tsx`

- [ ] Copy `shell.css` into `web/src/styles/` and import it in `layout.tsx`. Add the Google Fonts `<link>` (Inter, Outfit) the mocks use, in `layout.tsx`.
- [ ] Port `shell.js` into `<Nav>`: it just builds the nav markup (brand, tabs, wallet balance, gear). Replace `location.href` navigation with Next `<Link>`. Keep the `countUp` helper as a small util (used by data-bound numbers).
- [ ] Wrap children in `MockAuthProvider` in `layout.tsx`.
- [ ] Create placeholder route pages so the nav tabs resolve.
- [ ] **Verify:** `npm run dev`; nav renders on every route, tabs navigate, no console errors.

---

### Task B2: `lib/data.ts` — the mock→live seam

**Files:**
- Create: `web/src/lib/data.ts`

- [ ] Define the hooks the UI binds to: `useCycle()`, `usePrices()`, `usePosition()`, `useVotingPower()`, `useAccuracy()`, `useLeaderboard()`, and write actions `getDemoUSDC()`, `deposit(amount)`, `castVote(allocs)`, `claim()`. Types mirror `@concordia/shared` (`Cycle`, `Pick`, `Alloc`).
- [ ] Implement a **mock adapter**: seeded, realistic values (a cycle in `OPEN` with a countdown, ~8 tickers with prices, a sample position + NAV, a leaderboard). Write actions mutate local React state and resolve.
- [ ] Include a `resolveCycle()` dev trigger in the mock adapter that flips the cycle to resolved, updates NAV from the new prices, and sets a sample `useAccuracy()` score — this drives the demo's "watch the cycle resolve → accuracy appears → claim" beat without real contracts. (A button/keypress wires it in B5.)
- [ ] Implement a **live adapter**: calls `@concordia/shared` (`getCycle`, `getPrices`, `getVotingPower`, `castVote`, etc.) via `publicClient()`; writes use `useAuth().getWalletClient()`.
- [ ] Switch on `process.env.NEXT_PUBLIC_USE_MOCK` (default `true`).
- [ ] **Verify:** a temp page printing the hooks shows mock data; flipping the env (with real addresses) is the only change needed later.

---

### Task B3: Port Overview `/` (public, animated, mock data)

**Files:**
- Modify: `web/src/app/page.tsx` (replace the current World-ID-only page)
- Create: `web/src/styles/overview.css` (the cinematic page's inline `<style>`, copied)
- Create: `web/src/components/Overview.tsx` (`"use client"`)

- [ ] Move `cinematic.html`'s `<style>` block into `overview.css`; paste its markup into `Overview.tsx` (`class`→`className`).
- [ ] Run the cinematic animation JS **imperatively** inside a `useEffect` (drag-scrub, morph, SVG chartfield). Do not rewrite it in React.
- [ ] Bind the headline numbers (NAV, return, countdown) to `useCycle()`/`usePosition()` via the `countUp` util. Page is **public** — no login required to view.
- [ ] Add a **Join** button that calls `useAuth().login()` then `.verify()`, then reveals the deposit step (Task B4).
- [ ] **Verify:** `/` loads without login, animates correctly, shows mock NAV/countdown; Join button advances to verify.

---

### Task B4: Join flow — get-USDC + deposit (mock)

**Files:**
- Create: `web/src/components/JoinFlow.tsx`

- [ ] After `useAuth().isVerified` is true, show **Get demo USDC** (`getDemoUSDC()`) and **Deposit** (`deposit(amount)`).
- [ ] On deposit, update `usePosition()` (mock) so the Overview reflects new shares/NAV.
- [ ] **Verify:** click Join → (mock) verify → get USDC → deposit; confirm position/NAV update on Overview.

---

### Task B5: Port Vote `/vote` (mock data + mock castVote)

**Files:**
- Modify: `web/src/app/vote/page.tsx`
- Create: `web/src/styles/vote.css` (from `vote.html`)

- [ ] Port `vote.html` markup + CSS. Bind the stock list to `usePrices()`/`UNIVERSE`; allocation control updates local state.
- [ ] **Submit** calls `castVote(allocs)` (mock); show a confirmation + the cycle countdown from `useCycle()`. Gate submit behind `useAuth().isVerified` (or redirect to Join).
- [ ] After submit, expose a way to fire the mock `resolveCycle()` (a demo-only "resolve now" button or keypress) so the post-vote beat shows: cycle resolves → `useAccuracy()` score appears → `claim()` becomes available on Overview/Account.
- [ ] **Verify:** allocate across tickers, submit, see confirmation; weights normalize correctly; trigger resolve and confirm accuracy + claim appear.

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

- [ ] Fill real addresses in `shared/src/addresses.ts`.
- [ ] Set `NEXT_PUBLIC_USE_MOCK=false`.
- [ ] Swap `MockAuthProvider` → Track A's real `AuthProvider` in `layout.tsx`.
- [ ] **Verify:** Overview reads live NAV/cycle; deposit + castVote send real Base Sepolia txs via the sponsored wallet; World ID marks the wallet verified.

---

## Done when
All 6 pages render in one consistent shell; the demo path (land → Join → verify → get USDC → deposit → vote) runs end-to-end on mock data; flipping to live is the env + provider swap in B7, with no component rewrites.
