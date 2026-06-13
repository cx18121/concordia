import type { Request, Response, NextFunction } from "express";
import type { ApiKeyRecord, KeyStore } from "./keys.js";

/**
 * Alpaca-style auth: bots send their key id + secret in headers
 *   APCA-API-KEY-ID:     <keyId>
 *   APCA-API-SECRET-KEY: <secret>
 * On success the verified key record is attached to req.apiKey.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKeyRecord;
    }
  }
}

export function authMiddleware(store: KeyStore) {
  return (req: Request, res: Response, next: NextFunction) => {
    const keyId = req.header("APCA-API-KEY-ID");
    const secret = req.header("APCA-API-SECRET-KEY");

    if (!keyId || !secret) {
      return res.status(401).json({
        code: 40110000,
        message: "missing APCA-API-KEY-ID / APCA-API-SECRET-KEY headers",
      });
    }

    const rec = store.verify(keyId, secret);
    if (!rec) {
      return res.status(401).json({ code: 40110001, message: "invalid or revoked credentials" });
    }

    req.apiKey = rec;
    next();
  };
}

/** Guard a route to a specific scope. All bot keys are vote-only today. */
export function requireScope(scope: ApiKeyRecord["scopes"][number]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiKey?.scopes.includes(scope)) {
      return res.status(403).json({ code: 40310000, message: `key lacks scope: ${scope}` });
    }
    next();
  };
}
