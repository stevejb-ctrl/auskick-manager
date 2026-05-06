"use client";

import { useEffect } from "react";
import { isNative } from "@/lib/platform";

// ─── Native OAuth deep-link bridge ─────────────────────────────
// Inside the Capacitor shell, OAuth bounces look like:
//
//   1. Tap "Continue with Google" → app opens system browser at
//      Google's auth URL (with redirectTo=siren://auth/callback).
//   2. User signs in. Google → Supabase → siren://auth/callback?code=…
//   3. OS sees the siren:// scheme, hands the URL to MainActivity
//      (Android) / Info.plist URL handler (iOS), Capacitor fires
//      `App.appUrlOpen`.
//   4. We extract the code, dismiss the system browser, and
//      navigate the WebView to /auth/callback?code=… so the
//      existing server route exchanges the code and sets the
//      Supabase session cookie on the WebView's origin.
//
// The cookie path matters: SFSafariViewController (iOS) and Custom
// Tabs (Android) have *separate* cookie jars from the app's
// WebView. So we cannot let the system browser hit /auth/callback
// directly — its cookies wouldn't transfer. Bouncing back into the
// WebView for the exchange is what makes the session stick.
//
// Mounted in app/layout.tsx so the listener exists for the
// lifetime of the app, regardless of which route the user is on
// when the deep link fires.

interface DeepLink {
  code: string;
  next: string;
}

const SAFE_NEXT_DEFAULT = "/dashboard";

function parseDeepLink(url: string): DeepLink | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "siren:") return null;
    // siren://auth/callback?code=…  → host="auth", pathname="/callback"
    if (parsed.host !== "auth" || parsed.pathname !== "/callback") return null;
    const code = parsed.searchParams.get("code");
    if (!code) return null;
    const rawNext = parsed.searchParams.get("next");
    const next =
      rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
        ? rawNext
        : SAFE_NEXT_DEFAULT;
    return { code, next };
  } catch {
    return null;
  }
}

export function NativeAuthBridge() {
  useEffect(() => {
    if (!isNative()) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      // Dynamic imports keep @capacitor/* out of the web bundle —
      // these chunks only load when isNative() is true at runtime.
      const [{ App }, { Browser }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/browser"),
      ]);
      if (cancelled) return;

      const handle = await App.addListener("appUrlOpen", async ({ url }) => {
        const link = parseDeepLink(url);
        if (!link) return;

        // Close the in-app browser sheet if it's still up. Failing
        // to close is non-fatal; the WebView navigation below will
        // bring the app to front anyway.
        await Browser.close().catch(() => {});

        // Hand the code to the existing /auth/callback server
        // route. Same-origin navigation, so cookies set by the
        // server are immediately visible to subsequent requests.
        const target = `/auth/callback?code=${encodeURIComponent(link.code)}&next=${encodeURIComponent(link.next)}`;
        window.location.assign(target);
      });
      cleanup = () => {
        handle.remove();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
