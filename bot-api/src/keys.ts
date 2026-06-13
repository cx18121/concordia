import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * API key store. Each key is bound to one verified member's wallet and is **vote-only**
 * (no deposits, no withdrawals) — the scope the UI promises. The secret is shown once at
 * generation and only its hash is stored.
 *
 * This is an in-memory store for the demo; the `KeyStore` interface is the seam for a real
 * DB (Postgres/Redis) later. Nothing here moves money — keys can only call castVote.
 */

export type Scope = "vote"; // intentionally the only scope; withdrawals are never key-accessible

export interface ApiKeyRecord {
  keyId: string;
  secretHash: string;       // sha256(secret) — never the raw secret
  wallet: `0x${string}`;    // the member this key votes on behalf of
  label: string;
  scopes: Scope[];
  createdAt: number;
  revoked: boolean;
}

export interface IssuedKey {
  keyId: string;
  secret: string;           // returned ONCE, at generation
  wallet: `0x${string}`;
  label: string;
}

export interface KeyStore {
  issue(wallet: `0x${string}`, label: string): IssuedKey;
  verify(keyId: string, secret: string): ApiKeyRecord | null;
  revoke(keyId: string): boolean;
  listForWallet(wallet: `0x${string}`): ApiKeyRecord[];
}

const KEY_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"; // no I/O for legibility
const SECRET_ALPHABET = "abcdefghijkmnpqrstuvwxyz0123456789";
const SECRET_PREFIX = "cfsk_"; // community-fund secret key

function randFrom(alphabet: string, len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export class InMemoryKeyStore implements KeyStore {
  private byId = new Map<string, ApiKeyRecord>();

  issue(wallet: `0x${string}`, label: string): IssuedKey {
    const keyId = randFrom(KEY_ID_ALPHABET, 20);
    const secret = SECRET_PREFIX + randFrom(SECRET_ALPHABET, 24);
    this.byId.set(keyId, {
      keyId,
      secretHash: sha256(secret),
      wallet,
      label,
      scopes: ["vote"],
      createdAt: Date.now(),
      revoked: false,
    });
    return { keyId, secret, wallet, label };
  }

  verify(keyId: string, secret: string): ApiKeyRecord | null {
    const rec = this.byId.get(keyId);
    if (!rec || rec.revoked) return null;
    if (!constantTimeEqual(rec.secretHash, sha256(secret))) return null;
    return rec;
  }

  revoke(keyId: string): boolean {
    const rec = this.byId.get(keyId);
    if (!rec || rec.revoked) return false;
    rec.revoked = true;
    return true;
  }

  listForWallet(wallet: `0x${string}`): ApiKeyRecord[] {
    return [...this.byId.values()].filter((r) => r.wallet === wallet);
  }
}
