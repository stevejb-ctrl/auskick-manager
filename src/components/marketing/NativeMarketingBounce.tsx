"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNative } from "@/lib/platform";

/**
 * Belt-and-braces redirect off the marketing landing for native
 * Capacitor users.
 *
 * The canonical fix lives on three other layers:
 *   1. capacitor.config.ts → `server.url = "https://www.sirenfooty.com.au/login"`
 *      so the WebView never loads `/` to begin with.
 *   2. src/components/native/NativeCookieBridge.tsx → sets the
 *      `siren-native=1` cookie on first launch.
 *   3. src/lib/supabase/middleware.ts → server-side bounces every
 *      anonymous "/" request with that cookie to `/login`.
 *
 * The combination of (1)+(3) handles every code path EXCEPT the very
 * first launch of a TestFlight shell that was archived BEFORE the
 * `/login` server.url change landed (commit 4f306d8, 2026-05-13).
 * On those shells the WebView loads `/` directly, the cookie isn't
 * set yet (NativeCookieBridge runs on `useEffect`, after first
 * render), middleware sees no cookie, and the marketing site
 * renders. From the user's POV it looks like a marketing flash on
 * first cold launch.
 *
 * This component is the client-side defense against that flash. On
 * mount, if `isNative()` returns true, replace the route with
 * `/login`. `router.replace` keeps the browser-back-stack clean —
 * the marketing page never becomes a back-target.
 *
 * Web users: `isNative()` returns false, no-op, no redirect, no
 * render. Native users on newer Build 2+: the WebView already
 * loaded `/login` directly so this never mounts.
 *
 * Future cleanup: once Build 2 ships and all users have an iOS
 * shell with `server.url=/login`, this component becomes dead
 * code. Safe to delete then.
 */
export function NativeMarketingBounce() {
  const router = useRouter();
  useEffect(() => {
    if (isNative()) router.replace("/login");
  }, [router]);
  return null;
}
