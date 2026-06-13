"use client";

import { useRef, useState } from "react";
import {
  IDKitRequestWidget,
  deviceLegacy,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_BYPASS === "true";

interface Props {
  onVerified?: () => void;
  /** Fired exactly once when the modal is dismissed (or proof fails) without a prior success. */
  onCancel?: () => void;
  /** Bound into the proof so it commits to the wallet (idkit v4: passed to the preset, surfaces as signal_hash). */
  signal?: string;
}

export default function WorldIDVerify({ onVerified, onCancel, signal }: Props) {
  const [open, setOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True once onSuccess ran, so the close that follows isn't reported as a cancel.
  const succeededRef = useRef(false);

  const appId = process.env.NEXT_PUBLIC_WORLD_APP_ID as `app_${string}`;
  const action = process.env.NEXT_PUBLIC_WORLD_ACTION!;

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rp-signature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Failed to get RP signature");
      const data = await res.json();
      setRpContext({
        rp_id: data.rp_id,
        nonce: data.nonce,
        created_at: data.created_at,
        expires_at: data.expires_at,
        signature: data.sig,
      });
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(result: IDKitResult) {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idkitResponse: result }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message = (data as { error?: string }).error ?? "Verification failed";
      setError(message);
      // Proof failed: closing the modal below reports it as a cancel to the parent.
      throw new Error(message);
    }
  }

  function onSuccess() {
    succeededRef.current = true;
    setVerified(true);
    setOpen(false);
    onVerified?.();
  }

  // Dismissed (or closed after a failed proof) without a success → notify parent once.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next && !succeededRef.current) onCancel?.();
  }

  if (verified) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700">
        <span>✓</span>
        <span>Verified with World ID</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {rpContext && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={handleOpenChange}
          app_id={appId}
          action={action}
          rp_context={rpContext}
          allow_legacy_proofs={true}
          preset={deviceLegacy(signal ? { signal } : undefined)}
          handleVerify={handleVerify}
          onSuccess={onSuccess}
        />
      )}
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 transition-colors"
      >
        {loading ? "Preparing…" : "Verify with World ID"}
      </button>
      {DEV_BYPASS && (
        <button
          onClick={onSuccess}
          className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-600"
        >
          Skip verification (demo mode)
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
