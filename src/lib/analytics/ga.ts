import { cookies } from "next/headers";

// GA4 Measurement ID. Not a secret — the same ID is in the HTML of
// every page that loads GA anyway — so hardcoding it is fine and
// avoids the NEXT_PUBLIC_* inline-at-build-time foot-gun.
export const GA_ID = "G-ZBTGMZPTD0";

// e2e only. Outside production a request carrying this cookie loads
// GA with a dummy ID, so a spec can check which routes load GA. The
// dummy ID means a stray cookie on a preview deploy can never send
// hits to the real property, and production ignores the cookie.
export const GA_TEST_COOKIE = "siren-e2e-ga";
export const GA_TEST_ID = "G-E2ETEST000";

/**
 * The GA4 ID to load for this request, or null for none. Only the
 * production deploy gets the real ID — never local dev (`next dev`
 * leaves VERCEL_ENV undefined) or preview deploys.
 */
export function gaMeasurementId(): string | null {
  if (process.env.VERCEL_ENV === "production") return GA_ID;
  if (cookies().get(GA_TEST_COOKIE)?.value === "1") return GA_TEST_ID;
  return null;
}
