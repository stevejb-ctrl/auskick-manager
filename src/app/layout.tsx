import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import { Suspense } from "react";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";
import { baseOpenGraph, siteUrl } from "@/lib/seo";
import { gaMeasurementId } from "@/lib/analytics/ga";
import { posthogSettings } from "@/lib/analytics/posthog-server";
import { GoogleAnalyticsGate } from "@/components/analytics/GoogleAnalyticsGate";
import { PostHogAnalytics } from "@/components/analytics/PostHogAnalytics";
import { NativeAuthBridge } from "@/components/auth/NativeAuthBridge";
import { NativeCookieBridge } from "@/components/native/NativeCookieBridge";
import { NativeSplashHide } from "@/components/native/NativeSplashHide";
import { A11yRoot } from "@/components/ui/A11yRoot";
import { THEME_BOOT_SCRIPT } from "@/lib/themePreference";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
// GeistSans.variable is "--font-geist-sans". Used exclusively by the
// SirenWordmark so the brand wordmark renders in Geist 900 (Black)
// without switching the app-wide UI font away from Inter.

// Instrument Serif italic — used decoratively for round numerals on the
// Games list, the Home next-up hero, and the Game-detail upcoming hero.
// Italic weight 400 only; we never set non-italic on this face.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  variable: "--font-instrument-serif",
  display: "swap",
});

// Brand-aware metadata — middleware writes x-brand on the request so
// sirenfooty.com.au and sirennetball.com.au get their own title + meta
// description at render time. Falls back to AFL when no brand is set
// (e.g. if middleware is bypassed).
//
// metadataBase + icons are kept from main: metadataBase resolves
// per-page `alternates: { canonical: "/" }` exports against the apex
// host, and the icons block is the multi-resolution favicon set used
// by all branded sites.
export function generateMetadata(): Metadata {
  const brand = getBrand();
  const copy = getBrandCopy(brand.id);
  return {
    metadataBase: new URL(siteUrl()),
    title: copy.productName,
    description: copy.metaDescription,
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
      ],
      apple: { url: "/favicon-180.png", sizes: "180x180" },
      other: [{ rel: "icon", url: "/favicon-512.png", sizes: "512x512" }],
    },
    // iOS standalone-app metadata. `capable: true` tells iOS Safari
    // that "Add to Home Screen" should launch this site without the
    // browser chrome. We use `default` (not `black-translucent`)
    // because the (app) header is the light `bg-surface` cream —
    // `black-translucent` forces white status-bar icons which would
    // be invisible against it. If we later flip the header to a
    // brand-coloured dark bar, switch this to `black-translucent`
    // so the bar tints continuously up and over the notch.
    appleWebApp: {
      capable: true,
      title: copy.productName,
      statusBarStyle: "default",
    },
    // Link previews (WhatsApp, Facebook, Slack, X). The image itself is
    // src/app/opengraph-image.tsx, which Next adds as og:image for every
    // page. Scrapers fall back to <title> and the meta description, so
    // pages needn't repeat them here.
    openGraph: baseOpenGraph(),
    twitter: { card: "summary_large_image" },
  };
}

// Brand-aware theme colours for the viewport. `themeColor` paints the
// mobile-browser address bar (and, on Android Chrome's PWA, the system
// status bar). `viewportFit: "cover"` is what populates
// `env(safe-area-inset-*)` on iPhones with a notch / home indicator —
// without it the env() values resolve to 0 and our safe-area paddings
// are no-ops.
export function generateViewport(): Viewport {
  const brand = getBrand();
  const themeColor = brand.id === "netball" ? "#2E7FB8" : "#2F6B3E";
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    // The brand colour on a light phone; the dark page colour (the
    // palette's dark `warm`) on a dark one.
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: themeColor },
      { media: "(prefers-color-scheme: dark)", color: "#0F1311" },
    ],
    // Siren has its own dark theme (src/lib/theme/palette.ts), so it
    // says so: Chrome's auto-dark and Samsung Internet's dark mode leave
    // it to paint its own, and form controls and scrollbars follow. R6
    // had `only light` while there was no dark palette.
    colorScheme: "light dark",
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `data-brand` drives the CSS-variable theming layer in
  // globals.css — sirennetball.com.au gets the court-blue palette
  // and a court-blue Siren wordmark dot, sirenfooty.com.au keeps
  // the field-green default with the alarm-orange dot. Middleware
  // has already resolved the inbound host into the x-brand request
  // header by the time we render here, so getBrand() is the source
  // of truth.
  const brand = getBrand();
  const gaId = gaMeasurementId();
  const posthog = posthogSettings();
  return (
    // suppressHydrationWarning: the boot script below may add
    // data-theme to <html> before React hydrates.
    <html
      lang="en-AU"
      suppressHydrationWarning
      data-brand={brand.brand.id}
      className={`${sans.variable} ${mono.variable} ${GeistSans.variable} ${instrumentSerif.variable}`}
    >

      {/* Analytics components must live INSIDE <body>. Rendering
          <SpeedInsights /> (or <GoogleAnalyticsGate />) as a sibling of
          <body> produces invalid HTML — the browser parser moves
          their nodes into <body> while React's client-side renderer
          still expects them as children of <html>. The mismatch
          surfaces as a Suspense-boundary hydration error on every
          page (the call stack points at
          tryToClaimNextHydratableSuspenseInstance). Keeping them
          inside <body> avoids the parser fix-up entirely. */}
      <head>
        {/* Account → Theme (Light / Dark) onto <html> before the body
            paints, so a coach who chose Light on a dark phone sees no
            dark flash. System leaves it to prefers-color-scheme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans">
        {/* Capacitor JS bridge. Slice 7 fix for the
            `disallowed_useragent` OAuth error in the native shell.
            The Android Bridge.java injects `window.androidBridge`
            into the WebView regardless of which URL is loaded, but
            the `window.Capacitor` facade — which our isNative()
            check reads — only exists once @capacitor/core's
            capacitor.js has run. With `server.url` pointing at the
            remote site, Capacitor does NOT auto-inject this script;
            we have to serve it from our own origin. The file under
            /public/capacitor.js is copied from
            node_modules/@capacitor/core by the postinstall script.
            On web the script still runs but `getPlatform()`
            correctly returns "web" because there's no androidBridge
            to detect. beforeInteractive so the bridge is up before
            any client component mounts and calls isNative(). */}
        <Script src="/capacitor.js" strategy="beforeInteractive" />
        {/* Listens for siren:// OAuth callbacks inside the Capacitor
            shell. No-op on web — internally guarded by isNative()
            and dynamically imports @capacitor/* so the web bundle
            doesn't pay for code it never runs. */}
        <NativeAuthBridge />
        {/* Sets the `siren-native` cookie on Capacitor launches so
            the Vercel edge redirect (vercel.json) bypasses the
            marketing site on "/". Cookie-only — does NOT do any
            client-side route bouncing. No-op on web. */}
        <NativeCookieBridge />
        {/* Dismisses the Capacitor splash screen once React has
            mounted. The splash is configured in
            mobile/capacitor.config.ts to stay visible until JS
            hides it, covering the WebView's remote-URL cold start.
            No-op on web. */}
        <NativeSplashHide />
        {children}
        {/* The one polite live region (scores, subs and the end of a
            period are said into it, lib/a11y/announce) and the focus
            history dialogs return focus from. */}
        <A11yRoot />
        {/* Google Analytics, public pages only: never the app or a
            token link (/run/<token>, /join/<token>). The gate reads
            the URL with useSearchParams, hence the Suspense. */}
        {gaId && (
          <Suspense fallback={null}>
            <GoogleAnalyticsGate gaId={gaId} />
          </Suspense>
        )}
        {/* PostHog product analytics, everywhere, with on-screen text
            masked and tokens scrubbed (src/lib/analytics). Off unless
            this is production with a project key, or e2e debug mode. */}
        {posthog && (
          <PostHogAnalytics
            apiKey={posthog.apiKey}
            debug={posthog.debug}
            appVersion={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null}
          />
        )}
        <SpeedInsights />
      </body>
    </html>
  );
}
