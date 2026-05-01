import { getBrand } from "@/lib/brand";

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

/**
 * @deprecated Prefer {@link siteUrl} so the canonical host follows
 * the active brand. This constant is kept temporarily for any
 * callers that need a build-time string and don't have access to
 * `headers()` — for example, a side-tool not running inside the
 * RSC tree. New call sites should use `siteUrl()`.
 */
export const SITE_URL = "https://www.sirenfooty.com.au";
