import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";
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

// Brand-aware metadata — middleware writes x-brand on the request so
// sirenfooty.com.au and sirennetball.com.au get their own title + meta
// description at render time. Falls back to AFL when no brand is set
// (e.g. if middleware is bypassed).
export function generateMetadata(): Metadata {
  const brand = getBrand();
  const copy = getBrandCopy(brand.id);
  return {
    title: copy.productName,
    description: copy.metaDescription,
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
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans">{children}</body>
      {IS_PROD_DEPLOY && <GoogleAnalytics gaId={GA_ID} />}
      <SpeedInsights />
    </html>
  );
}
