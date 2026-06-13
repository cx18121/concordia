// Avatar helpers: deterministic letter-fallback + a localStorage-backed store for
// user-uploaded pictures. No backend yet — uploads persist client-side keyed by a
// stable id (wallet address for the current user, author name for mock forum users).
// Swap the get/set seam for a real upload endpoint + URL when storage lands.

const STORAGE_PREFIX = "cf:avatar:";
export const AVATAR_EVENT = "cf:avatar-changed";

/** First alphanumeric character of a name, uppercased. Falls back to "?". */
export function initial(name: string): string {
  const m = name.match(/[a-zA-Z0-9]/);
  return m ? m[0].toUpperCase() : "?";
}

/** Deterministic, pleasant background color derived from the name. */
export function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 55% 42%)`;
}

export function avatarKey(id: string): string {
  return STORAGE_PREFIX + id.toLowerCase();
}

/** Read a stored avatar data URL for `id`, or null. SSR-safe. */
export function getAvatar(id: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(avatarKey(id));
  } catch {
    return null;
  }
}

/** Persist an avatar data URL for `id` and notify listeners. */
export function setAvatar(id: string, dataUrl: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(avatarKey(id), dataUrl);
    window.dispatchEvent(new CustomEvent(AVATAR_EVENT, { detail: { id } }));
  } catch {
    /* quota or disabled storage — ignore, fall back to letter */
  }
}

/** Remove a stored avatar for `id`. */
export function clearAvatar(id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(avatarKey(id));
    window.dispatchEvent(new CustomEvent(AVATAR_EVENT, { detail: { id } }));
  } catch {
    /* ignore */
  }
}

/**
 * Read a File, downscale to a square `size`px JPEG data URL (keeps localStorage small).
 * Returns the data URL.
 */
export function fileToAvatarDataUrl(file: File, size = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("could not load image"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas context"));
        // cover-fit crop
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
