"use client";

import { useEffect, useRef, useState } from "react";
import {
  AVATAR_EVENT,
  colorFor,
  fileToAvatarDataUrl,
  getAvatar,
  initial,
  setAvatar,
} from "@/lib/avatars";

type Props = {
  /** Display name — drives the letter fallback + color. */
  name: string;
  /** Storage key for an uploaded picture. Defaults to `name`. */
  id?: string;
  /** Pixel size of the square avatar. */
  size?: number;
  /** Extra classes (e.g. rounding) — defaults to a rounded square like the mockup. */
  className?: string;
  /** Show an upload control on hover (use for the current user's own avatar). */
  editable?: boolean;
};

export default function Avatar({
  name,
  id,
  size = 48,
  className = "rounded-xl",
  editable = false,
}: Props) {
  const key = id ?? name;
  const [src, setSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // load + keep in sync across tabs/components
  useEffect(() => {
    setSrc(getAvatar(key));
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string } | undefined;
      if (!detail?.id || detail.id.toLowerCase() === key.toLowerCase()) {
        setSrc(getAvatar(key));
      }
    };
    window.addEventListener(AVATAR_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(AVATAR_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [key]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setAvatar(key, dataUrl);
    } catch {
      /* ignore bad file */
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const dim = { width: size, height: size } as const;

  return (
    <div
      className={`relative overflow-hidden border border-white/10 flex-shrink-0 ${className} ${editable ? "group/avatar cursor-pointer" : ""}`}
      style={dim}
      onClick={editable ? () => fileRef.current?.click() : undefined}
      title={editable ? "Upload a profile picture" : name}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={name} src={src} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center font-display font-bold text-white select-none"
          style={{ background: colorFor(name), fontSize: Math.round(size * 0.42) }}
        >
          {initial(name)}
        </div>
      )}

      {editable && (
        <>
          <div className="absolute inset-0 bg-black/55 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center">
            <span className="material-symbols-outlined text-white" style={{ fontSize: Math.round(size * 0.34) }}>
              photo_camera
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPick}
            className="hidden"
          />
        </>
      )}
    </div>
  );
}
