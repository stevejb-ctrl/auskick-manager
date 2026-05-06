import type { MetadataRoute } from "next";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";
import { siteUrl } from "@/lib/seo";

// Per-brand splash + chrome colours. Sourced from --brand-600 in
// src/app/globals.css so the standalone install matches the in-app
// theming exactly.
const BRAND_THEME = {
  afl: { theme: "#2F6B3E", background: "#ffffff" },
  netball: { theme: "#2E7FB8", background: "#ffffff" },
} as const;

// Force per-request rendering so middleware's x-brand header is read
// every time. Without this, Next would cache the manifest at build
// time and both brands would share whichever brand happened to render
// first.
export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  const brand = getBrand();
  const copy = getBrandCopy(brand.id);
  const colors = BRAND_THEME[brand.id] ?? BRAND_THEME.afl;

  return {
    id: siteUrl(),
    name: copy.productName,
    short_name: copy.productName.replace(/^Siren\s+/, ""),
    description: copy.metaDescription,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: colors.theme,
    background_color: colors.background,
    icons: [
      { src: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { src: "/favicon-64.png", sizes: "64x64", type: "image/png" },
      { src: "/favicon-180.png", sizes: "180x180", type: "image/png" },
      {
        src: "/favicon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
