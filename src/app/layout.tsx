import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GoogleAnalytics } from "@next/third-parties/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";
import { siteUrl } from "@/lib/seo";
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
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

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
        {children}
        {IS_PROD_DEPLOY && <GoogleAnalytics gaId={GA_ID} />}
        <SpeedInsights />
      </body>
    </html>
  );
}
