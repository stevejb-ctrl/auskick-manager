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
    // Native shell loads the live production site DIRECTLY at
    // /login. Server actions, RSC, middleware, brand routing, and
    // Vercel cron all keep working unchanged. Updates ship via
    // Vercel deploys without an App Store release.
    //
    // Why /login and not "/" — the marketing landing page is for
    // people who arrive at sirenfooty.com.au in a browser tab.
    // Inside the native app there's no value in showing it: a
    // signed-out user sees /login (existing middleware already
    // bounces unauth requests for protected paths there), and a
    // signed-in user is sent straight to /dashboard by the
    // existing /login authed-user redirect. Either way the app
    // never lands on marketing chrome, which is what made the
    // app feel like "a website with the app overlaid after login"
    // in the first iPhone build.
    //
    // Web visitors are unaffected — they still hit
    // https://www.sirenfooty.com.au/ for the marketing site.
    url: "https://www.sirenfooty.com.au/login",
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
    // `contentInset: "never"` tells iOS WKWebView NOT to auto-adjust
    // the scroll view for the safe area. The web page owns safe-area
    // handling entirely via `env(safe-area-inset-*)` in CSS.
    //
    // Was `"always"`. That setting produced a state-dependent gap:
    // the WebView shifted content down by the safe-area at scroll=0
    // (in-flow elements) but NOT once the same element became
    // position-stuck — visible as a 200-300px phantom band above
    // the (app) header when at the top of the page on iPhone. CSS
    // env()-based padding can't fully cancel iOS's adjustment
    // because the adjustment value isn't exposed to CSS, so the
    // only clean fix is to disable the auto-adjustment.
    //
    // Takes effect on the next native build only — installed
    // TestFlight shells still have the old "always" baked in.
    contentInset: "never",
  },
  android: {
    // Block http:// resources to keep the WebView TLS-only. Modern
    // Android already enforces this at the network layer; the flag
    // is belt-and-braces.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      // Cover the WebView-cold-start gap with a branded splash.
      // server.url points at the remote site so the WebView is
      // network-bound on every launch; that load takes 1-4 seconds
      // on LTE and used to show as a blank screen. The splash
      // plugin keeps a static image visible OVER the WebView until
      // the React app calls SplashScreen.hide() — see
      // src/components/native/NativeSplashHide.tsx for the hide
      // call.
      //
      // launchAutoHide: false → splash never auto-dismisses on its
      // own; JS owns the hide moment. The 5s safety net below
      // catches the edge case where the WebView load itself fails
      // and hide() never gets called.
      launchAutoHide: false,
      launchFadeOutDuration: 250,
      backgroundColor: "#F7F5F1",
      splashFullScreen: true,
      splashImmersive: false,
      // 5s ceiling so the splash CAN'T stick forever even if the
      // remote page never loads. Past 5s it's better to show
      // whatever the WebView is currently displaying (likely an
      // error page) than a frozen splash.
      launchShowDuration: 5000,
    },
  },
};

export default config;
