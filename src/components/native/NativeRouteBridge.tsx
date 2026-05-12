"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isNative, NATIVE_COOKIE_NAME } from "@/lib/platform";

// Native-shell routing fix.
//
// Problem this solves (Steve, May 2026, on iPhone):
//   "Open the app, it shows the website, you login, then the actual
//    application shows as a sort of overlay."
//
// The Capacitor shell loads https://www.sirenfooty.com.au as a remote
// URL. On a fresh launch the user has no session yet, so the public
// home page renders the marketing site — which feels exactly like
// "the app is just a website with the app overlaid after login."
//
// The fix is layered:
//
//   1. CLIENT (this file). On every native launch, write a long-lived
//      `siren-native=1` cookie into the WebView's cookie jar. That
//      marks every subsequent request as native.
//
//   2. SERVER (middleware.ts). Sees the cookie + unauthed + path "/"
//      and redirects to /login server-side. Zero flash from the
//      second launch onward.
//
//   3. CLIENT FALLBACK (this file). On the first launch the cookie
//      isn't on the request yet (we're setting it right now), so the
//      server still rendered the marketing page. We catch that here
//      and client-side-replace to /login. ~one frame of marketing
//      flashes; every launch after that is zero-flash via the
//      middleware.
//
// Mounted in the root layout so it runs on every page — keeps the
// cookie fresh and rescues any anomaly where the WebView lands on
// the marketing root.
export function NativeRouteBridge() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isNative()) return;

    // 1 year. The WKWebView / Android WebView cookie jar persists
    // across app launches, so this only ever needs to be set once
    // per install — but writing it every mount is cheap and means
    // we recover automatically if the cookie was ever cleared
    // (Settings → Clear Website Data on iOS, app data wipe on
    // Android).
    document.cookie = `${NATIVE_COOKIE_NAME}=1; path=/; max-age=31536000; SameSite=Lax`;

    if (pathname === "/") {
      // router.replace (not push) so the marketing page never lands
      // in the back stack — there's no useful UX to "go back to"
      // inside a native app.
      router.replace("/login");
    }
  }, [pathname, router]);

  return null;
}
