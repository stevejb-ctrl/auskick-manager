// ─── Brand resolver (RSC + middleware) ───────────────────────
// The active brand is decided by (in priority order):
//   1. `x-brand` request header set by middleware from the host name.
//   2. `NEXT_PUBLIC_DEFAULT_BRAND` env var (dev only).
//   3. `?brand=netball` query param (dev only).
//   4. Fallback: AFL.
//
// Brand affects marketing copy + default sport on sign-up. It does
// NOT affect which teams a user can see once signed in — a coach who
// manages both a footy team and a netball team sees both regardless
// of which domain they arrived from.

import { headers } from "next/headers";
import {
  getBrandForHost,
  getSportByBrand,
  type SportConfig,
} from "@/lib/sports";

const BRAND_HEADER = "x-brand";
const BRAND_COOKIE = "siren_brand";

/** Header name used internally to propagate brand from middleware to RSC. */
export const BRAND_HEADER_NAME = BRAND_HEADER;
/** Cookie name used for sticky brand override (dev only). */
export const BRAND_COOKIE_NAME = BRAND_COOKIE;

/**
 * Resolve the active brand for an RSC render.
 * Reads the x-brand header written by middleware.
 */
export function getBrand(): SportConfig {
  const h = headers();
  const brandHeader = h.get(BRAND_HEADER);
  if (brandHeader) return getSportByBrand(brandHeader);

  // Fallback to host parsing in case middleware is bypassed (rare).
  const host = h.get("host");
  return getBrandForHost(host);
}

/**
 * Resolve the brand from a raw host header string (used by middleware
 * before Next's `headers()` helper is available).
 */
export function resolveBrandFromHost(
  host: string | null | undefined,
  override?: string | null,
): SportConfig {
  // Explicit override wins (query param or env).
  if (override) return getSportByBrand(override);
  return getBrandForHost(host);
}
