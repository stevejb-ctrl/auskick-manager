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
//   - reloadOnOnline is OFF. It reloaded the page whenever the
//     device came back online, and that reload could render before
//     the write queue drained: AFL showed the lineup from before the
//     offline taps for over a minute, and every open sheet was wiped
//     (UX round 3, 24 Oct 2026). Live pages catch up through LiveSync
//     instead (it checks the game when the signal returns); the
//     /offline fallback reloads itself (ReloadWhenOnline).
//   - fallbacks.document: failed page navigations land on a
//     custom /offline route (slice 6c) instead of Chrome's
//     default error page.
//
// Deploy-safety tweaks (May 2026, after a white-screen on the
// installed iOS app right after a Vercel deploy):
//   - skipWaiting + clientsClaim so a new SW activates immediately
//     for already-open clients instead of waiting for every tab to
//     close. Without this, a Capacitor WebView that's been kept
//     warm in app-switcher state will keep using the old SW
//     forever and serve stale precache.
//   - cleanupOutdatedCaches removes precache buckets from prior SW
//     versions on activation, so the cache jar doesn't grow
//     monotonically and old chunk URLs (which now 404) stop being
//     candidates.
//   - extendDefaultRuntimeCaching keeps the workbox defaults that
//     handle Google fonts, images, audio, etc. but lets us bolt on
//     the rules below.
//   - Explicit NetworkFirst rule for navigations (HTML documents)
//     with a short timeout so we always prefer the freshest shell.
//     CacheFirst here is the well-documented PWA footgun that
//     leaves users stuck on a stale shell pointing at chunks the
//     server no longer has after a deploy.
//   - NetworkFirst for the _next/data RSC payloads for the same
//     reason — they're regenerated each build and the cache key
//     embeds the build ID.

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: false,
  // skipWaiting+clientsClaim plus outdated-cache cleanup is the
  // recommended combo for an app that ships frequent deploys.
  // Without them the SW update flow takes two app launches to land,
  // and the first one can serve a broken hybrid of old shell + new
  // chunks (or vice-versa).
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        // HTML navigations — always prefer fresh, fall back to
        // cache only on slow network. 3s is generous enough not to
        // false-trigger on patchy mobile data but tight enough that
        // a fully-offline launch hits the cache quickly.
        urlPattern: ({ request }) => request.mode === "navigate",
        handler: "NetworkFirst",
        options: {
          cacheName: "siren-pages",
          networkTimeoutSeconds: 3,
          expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
        },
      },
      {
        // RSC + Next data payloads. NetworkFirst because they carry
        // the build ID and stale ones produce hydration mismatches.
        urlPattern: /\/_next\/data\/.*\.json$/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "siren-rsc-data",
          networkTimeoutSeconds: 3,
          expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
        },
      },
      {
        // Hashed static chunks under /_next/static/* are immutable
        // (the hash IS the version), so CacheFirst is correct here
        // and saves the network round-trip on cold start.
        urlPattern: /\/_next\/static\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "siren-next-static",
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
    ],
  },
  extendDefaultRuntimeCaching: true,
  fallbacks: {
    document: "/offline",
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // PostHog's API paths end in "/" (/e/, /flags/), so Next mustn't
  // redirect them to the slash-less URL. src/middleware.ts still strips
  // trailing slashes from every page, so each page keeps one URL.
  skipTrailingSlashRedirect: true,

  // PostHog through our own domain (src/lib/analytics/posthog-config.ts):
  // ad blockers drop events sent to posthog.com, and this way the
  // browser only ever talks to sirenfooty.com.au. US cloud.
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
};

export default withPWA(nextConfig);
