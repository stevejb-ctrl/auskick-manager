import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GoogleAnalytics } from "@next/third-parties/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";
import { siteUrl } from "@/lib/seo";
import { NativeAuthBridge } from "@/components/auth/NativeAuthBridge";
import { NativeRouteBridge } from "@/components/native/NativeRouteBridge";
import { StandaloneMarker } from "@/components/pwa/StandaloneMarker";
import "./globals.css";

// GA4 Measurement ID. Not a secret — the same ID is in the HTML of
// every page anyway — so hardcoding it is fine and avoids the
// NEXT_PUBLIC_* inline-at-build-time foot-gun. Gated on VERCEL_ENV
// so analytics only fires on the production deploy, never from
// local dev (`next dev` leaves VERCEL_ENV undefined) or preview
// deploys.
const GA_ID = "G-ZBTGMZPTD0";
const IS_PROD_DEPLOY = process.env.VERCEL_ENV === "production";

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
    themeColor,
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
  return (
    <html
      lang="en"
      data-brand={brand.brand.id}
      className={`${sans.variable} ${mono.variable} ${GeistSans.variable} ${instrumentSerif.variable}`}
    >

      {/* Analytics components must live INSIDE <body>. Rendering
          <SpeedInsights /> (or <GoogleAnalytics />) as a sibling of
          <body> produces invalid HTML — the browser parser moves
          their nodes into <body> while React's client-side renderer
          still expects them as children of <html>. The mismatch
          surfaces as a Suspense-boundary hydration error on every
          page (the call stack points at
          tryToClaimNextHydratableSuspenseInstance). Keeping them
          inside <body> avoids the parser fix-up entirely. */}
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
        {/* Marks every request from the iOS/Android Capacitor shell
            with a `siren-native` cookie so the middleware can skip
            the marketing landing on native opens. No-op on web. */}
        <NativeRouteBridge />
        {/* Flips `html[data-standalone="true"]` when the page is
            launched from a home-screen PWA install. CSS + JS code
            read this to hide install prompts, in-browser-only chrome,
            and to render in-app navigation when browser back isn't
            available. */}
        <StandaloneMarker />
        {children}
        {IS_PROD_DEPLOY && <GoogleAnalytics gaId={GA_ID} />}
        <SpeedInsights />
      </body>
    </html>
  );
}
