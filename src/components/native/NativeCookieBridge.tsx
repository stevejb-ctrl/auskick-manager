"use client";

import { useEffect } from "react";
import { isNative, NATIVE_COOKIE_NAME } from "@/lib/platform";

// Sets `siren-native=1` in the WebView's cookie jar on every native
// launch. The Vercel edge redirect in vercel.json then catches
// requests for "/" with this cookie and 308s to /login — so the iOS
// / Android app stops landing on the marketing site.
//
// Intentionally does NOT bounce the route client-side. The previous
// iteration of this fix tried to `router.replace("/login")` from a
// client effect and, in combination with a stale service worker on
// installed Capacitor shells, produced a white screen on cold
// launches. Keeping this component cookie-only means routing is
// entirely the responsibility of the edge — provably side-effect
// free, no Suspense/hook surprises.
//
// First-launch flash:
//   On the very first launch after install, the cookie isn't on
//   the request yet, so the server still renders marketing for one
//   request. The cookie set here means every launch from the
//   second onward is zero-flash via the edge redirect. To kill the
//   first-launch flash entirely, the Capacitor shell's server.url
//   should point at /login directly (see mobile/capacitor.config.ts).
export function NativeCookieBridge() {
  useEffect(() => {
    if (!isNative()) return;
    // 1 year. WKWebView / Android WebView cookie jars persist
    // across app launches; rewriting on every mount is cheap and
    // makes us resilient to manual data-clears.
    document.cookie = `${NATIVE_COOKIE_NAME}=1; path=/; max-age=31536000; SameSite=Lax`;
  }, []);

  return null;
}
