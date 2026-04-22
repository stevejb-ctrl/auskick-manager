import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";

// Only render the GA script if a measurement ID is configured. Keeps
// local dev clean (no events unless you explicitly set the env var)
// and avoids shipping the tag to preview deploys if we'd rather not.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

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

export const metadata: Metadata = {
  title: "Siren Footy",
  description: "AFL U10s team and substitution manager",
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
      {GA_ID && <GoogleAnalytics gaId={GA_ID} />}
    </html>
  );
}
