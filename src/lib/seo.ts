import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";

/**
 * Single source of truth for the canonical production host. Used
 * by robots.ts, sitemap.ts, and layout.tsx's `metadataBase` so a
 * host rename only happens here. Apex (`sirenfooty.com.au`,
 * `sirennetball.com.au`) 301-redirects to www at the Vercel domain
 * layer — don't list both anywhere or Search Console flags them as
 * duplicates.
 *
 * Returns a brand-resolved URL. Middleware writes `x-brand` on the
 * request header, `getBrand()` reads it, and we emit
 * `https://www.${brand.host}`. Falls back to AFL when no brand is
 * resolved (e.g. middleware bypass, unit-test SSR without
 * headers()).
 */
export function siteUrl(): string {
  const brand = getBrand();
  return `https://www.${brand.brand.host}`;
}

/** Alt text for the link-preview image (src/app/opengraph-image.tsx). */
export const OG_IMAGE_ALT =
  "Siren: game day for junior sport coaches, with fair rotations and live scores";

/**
 * Open Graph fields every page shares: the brand's site name, the
 * Australian locale and the preview image. The root layout sets them.
 *
 * A page that sets its own `openGraph` replaces the parent's wholesale
 * (Next merges metadata shallowly). That includes the image Next adds
 * from src/app/opengraph-image.tsx, so spread this in first. On pages
 * that don't set `openGraph`, Next's own tag for that file wins over
 * the `images` entry here.
 */
export function baseOpenGraph(): NonNullable<Metadata["openGraph"]> {
  const copy = getBrandCopy(getBrand().id);
  return {
    type: "website",
    siteName: copy.productName,
    locale: "en_AU",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: OG_IMAGE_ALT, type: "image/png" }],
  };
}

/**
 * @deprecated Prefer {@link siteUrl} so the canonical host follows
 * the active brand. This constant is kept temporarily for any
 * callers that need a build-time string and don't have access to
 * `headers()` — for example, a side-tool not running inside the
 * RSC tree. New call sites should use `siteUrl()`.
 */
export const SITE_URL = "https://www.sirenfooty.com.au";
