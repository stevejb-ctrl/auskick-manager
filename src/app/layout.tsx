import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { GoogleAnalytics } from "@next/third-parties/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

// GA4 Measurement ID. Not a secret — the same ID is in the HTML of
// every page anyway — so hardcoding it is fine and avoids the
// NEXT_PUBLIC_* inline-at-build-time foot-gun. Gated on VERCEL_ENV
// so analytics only fires on the production deploy, never from
// local dev (`next dev` leaves VERCEL_ENV undefined) or preview
// deploys.
const GA_ID = "G-ZBTGMZPTD0";
const IS_PROD_DEPLOY = process.env.VERCEL_ENV === "production";

// Geist + Geist Mono via Vercel's official `geist` package — the
// font catalogue inside `next/font/google` doesn't ship Geist on
// Next 14.2, so the standalone package is the canonical path. Both
// exports register their own CSS variable; we alias them to the
// project's existing --font-geist / --font-geist-mono names via the
// `variable` field so every consumer of those tokens (Tailwind
// `font-sans`/`font-mono`, the `.nums` utility, every direct
// `font-mono` className) keeps working without changing.
const sans = GeistSans;
const mono = GeistMono;

export const metadata: Metadata = {
  title: "Siren Footy",
  description: "Junior AFL team and substitution manager",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans">{children}</body>
      {IS_PROD_DEPLOY && <GoogleAnalytics gaId={GA_ID} />}
      <SpeedInsights />
    </html>
  );
}
