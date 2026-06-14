"use client";

// Shared agent API key — one source of truth for the credential shown on BOTH
// the Vote page ("API keys" card) and Settings ("Agent API access"). The secret
// is minted by POST /api/agent/keys and cached in localStorage, so both surfaces
// display the SAME key and "regenerate" anywhere updates everywhere. Format is
// cfsk_… to match the agent API store (agentApi.ts issueKey()).

const LS_KEY = "cf:agentSecret";

/** Read the cached agent secret, or null if none has been generated yet. */
export function loadAgentSecret(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

/** Persist (or clear) the agent secret so every surface shows the same key. */
export function saveAgentSecret(secret: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (secret) window.localStorage.setItem(LS_KEY, secret);
    else window.localStorage.removeItem(LS_KEY);
  } catch {
    /* storage unavailable — fall back to in-memory only */
  }
}

/** Mint a fresh key via the agent API and cache it. Returns the new secret. */
export async function generateAgentKey(): Promise<string> {
  const res = await fetch("/api/agent/keys", { method: "POST" });
  const data = (await res.json()) as { keyId: string; secret: string };
  saveAgentSecret(data.secret);
  return data.secret;
}

/** Masked form for display when hidden — keeps the cfsk_ prefix + last 4 chars. */
export function maskSecret(secret: string | null): string {
  if (!secret) return `cfsk_${"•".repeat(14)}`;
  return `cfsk_${"•".repeat(10)}${secret.slice(-4)}`;
}
