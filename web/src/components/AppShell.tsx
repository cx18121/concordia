"use client";

// AppShell — the membership gate that wraps every route.
//
// Non-members (no position in the fund) get NO nav and are routed to the public
// /welcome page; the only other path they may reach is /join (so they can
// actually join). Members get the nav + full app, and /welcome becomes
// inaccessible (it redirects them home).
//
// "Joined" == holding a position (useHasJoined → position.shares > 0), which
// flips the instant the /join deposit runs in the same session.

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useHasJoined } from "@/lib/data";
import Nav from "./Nav";

// Routes a non-member is allowed to see. Everything else redirects to /welcome.
const PUBLIC_PREFIXES = ["/welcome", "/join"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const joined = useHasJoined();

  const onWelcome = pathname === "/welcome";
  const wantsRedirect =
    (!joined && !isPublic(pathname)) || (joined && onWelcome);

  useEffect(() => {
    if (!joined && !isPublic(pathname)) {
      router.replace("/welcome"); // non-member peeking at the app
    } else if (joined && onWelcome) {
      router.replace("/"); // member can't revisit the pre-join page
    }
  }, [joined, pathname, onWelcome, router]);

  return (
    <>
      {/* Non-members get no nav (and no mode toggle) — the welcome page's
          "View demo" / "Join live fund" buttons choose the mode instead. */}
      {joined && <Nav />}
      {/* Render nothing while a redirect is pending so the wrong screen never
          flashes (e.g. gated content before the bounce to /welcome). */}
      {wantsRedirect ? null : children}
    </>
  );
}
