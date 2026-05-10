import withPWAInit from "@ducanh2912/next-pwa";

// ─── PWA / service-worker config ──────────────────────────────
//
// Slice 6: turns the deployed web app into a real offline-capable
// PWA. Inside the Capacitor shell this is what makes the live-game
// route survive a network drop or a force-quit-then-relaunch —
// without the SW, the WebView falls back to Chrome's "Webpage not
// available" / Next's "Failed to fetch" error pages on cold start.
//
// Defaults are deliberately conservative:
//   - Disabled in dev so HMR / fast refresh work cleanly.
//   - cacheOnFrontEndNav: every client-side navigation populates
//     the cache, so once a coach opens a game while online they
//     can come back to it offline.
//   - aggressiveFrontEndNavCaching: also caches deeper-linked
//     resources picked up during navigation (RSC payloads,
//     code-split chunks).
//   - reloadOnOnline: when the device flips back online we ask
//     the page to reload so the SW can fetch fresh content. Slice
//     5d's write queue has already drained by this point.
//   - fallbacks.document: failed page navigations land on a
//     custom /offline route (slice 6c) instead of Chrome's
//     default error page.

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  fallbacks: {
    document: "/offline",
  },
  // Default Workbox runtimeCaching from @ducanh2912/next-pwa is
  // sensible for our shape (NetworkFirst for HTML, CacheFirst for
  // static assets, NetworkOnly for /api/* and POSTs). If we need
  // to tighten the live-game page specifically later, override
  // workboxOptions.runtimeCaching here.
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withPWA(nextConfig);
