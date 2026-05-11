import type { CapacitorConfig } from "@capacitor/cli";

// Bundle ID is locked for life — App Store and Play Store both
// refuse renames after the first submission. au.com.sirenfooty.app
// matches the public domain and reads as a Siren-owned identifier.
//
// V1 ships AFL-only. A netball-flavored counterpart is a v2 task —
// once Siren Footy clears App Review we'll add Android product
// flavors + iOS schemes for au.com.sirennetball.app loading
// sirennetball.com.au. Until then, netball coaches who install
// Siren Footy can still sign in and use the app fully; only the
// marketing landing pages will be footy-themed for them.
const config: CapacitorConfig = {
  appId: "au.com.sirenfooty.app",
  appName: "Siren Footy",
  // Local fallback shown briefly while the remote site loads, or
  // when there's no network on cold start. The remote URL below
  // takes over once the page resolves.
  webDir: "www",
  server: {
    // Native shell loads the live production site. Server actions,
    // RSC, middleware, brand routing, and Vercel cron all keep
    // working unchanged. Updates ship via Vercel deploys without
    // an App Store release.
    url: "https://www.sirenfooty.com.au",
    cleartext: false,
    // Allowlist hosts the WebView is permitted to navigate to.
    // Required for Supabase XHR + any in-WebView OAuth bounces.
    // The native auth flow will use the system browser via
    // @capacitor/browser, but allowing accounts.google.com /
    // appleid.apple.com here is harmless and forward-compatible.
    allowNavigation: [
      "*.supabase.co",
      "accounts.google.com",
      "appleid.apple.com",
      "www.sirenfooty.com.au",
    ],
  },
  ios: {
    // Lets the WebView extend behind the home indicator + status
    // bar; the page handles its own safe-area insets via Tailwind.
    contentInset: "always",
  },
  android: {
    // Block http:// resources to keep the WebView TLS-only. Modern
    // Android already enforces this at the network layer; the flag
    // is belt-and-braces.
    allowMixedContent: false,
  },
};

export default config;
