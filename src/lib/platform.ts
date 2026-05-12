// ─── Native-context detection (Capacitor) ────────────────────
// Same code runs on web and inside the Capacitor WebView shell.
// On web, `window.Capacitor` is undefined and `isNative()` returns
// false, so every branch below is dead-code-eliminated for the
// browser. No build-time flags or conditional bundling needed.
//
// Used by:
//   - auth flows (deep-link OAuth instead of in-page redirect)
//   - share / invite / password-reset URLs (canonical web origin
//     for emails and SMS, since recipients click those links from
//     contexts where the app may not be installed)
//   - push-notification registration (only meaningful on device)

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

// Cookie set by NativeRouteBridge on first Capacitor launch. The
// middleware reads it to know the request is coming from the iOS /
// Android shell and short-circuit the marketing surface so the app
// never feels like a website with the app overlaid on top.
//
// Constant lives here (not in middleware.ts) so the client bridge
// and the server middleware reference the same string.
export const NATIVE_COOKIE_NAME = "siren-native";

export type Platform = "ios" | "android" | "web";

export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

export function platform(): Platform {
  if (typeof window === "undefined") return "web";
  const raw = window.Capacitor?.getPlatform?.();
  if (raw === "ios" || raw === "android") return raw;
  return "web";
}

/**
 * Canonical origin for links that travel outside the app —
 * password-reset emails, parent-invite SMS, runner-link share
 * sheets. Recipients will open these from arbitrary contexts
 * (Mail, Messages, Slack), so the link must point at the public
 * web host, never at a `siren://` deep link.
 *
 * On web: returns `window.location.origin`, which is already
 *   brand-aware (sirenfooty.com.au vs sirennetball.com.au) and
 *   correct for every preview/prod deploy automatically.
 *
 * On native: web `origin` is something like `capacitor://localhost`,
 *   which is useless in an outbound link. Falls back to
 *   `NEXT_PUBLIC_PUBLIC_ORIGIN` (configured per-brand at build
 *   time on the native shell), then to a hardcoded sirenfooty
 *   default if the env is unset.
 */
export function publicOrigin(): string {
  if (typeof window !== "undefined" && !isNative()) {
    return window.location.origin;
  }
  return (
    process.env.NEXT_PUBLIC_PUBLIC_ORIGIN ?? "https://www.sirenfooty.com.au"
  );
}
