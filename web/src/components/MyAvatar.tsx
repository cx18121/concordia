"use client";

// The current user's editable avatar. Keyed by wallet address so the uploaded
// picture follows the account; falls back to the username's first letter.

import { useAuth } from "@/lib/useAuth";
import Avatar from "./Avatar";

export default function MyAvatar({ name = "You", size = 56 }: { name?: string; size?: number }) {
  const { address } = useAuth();
  const id = address ?? "me";
  return <Avatar name={name} id={id} size={size} editable className="rounded-full" />;
}
