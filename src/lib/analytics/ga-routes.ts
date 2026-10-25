import { INDEXABLE_ROUTES, UNLISTED_ANALYTICS_PATHS } from "@/lib/public-routes";

// Google Analytics runs on the pages we want found, the sitemap's
// pages in src/lib/public-routes.ts, plus /login (unlisted, but the end
// of the marketing funnel), and nowhere else. Above all it
// stays off the token routes: /run/<token> gives live control of a
// game and /join/<token> is a team invite, so their URLs must never
// reach Google.
const GA_PATHS: ReadonlySet<string> = new Set([
  ...INDEXABLE_ROUTES.map((r) => r.path),
  ...UNLISTED_ANALYTICS_PATHS,
]);

// Campaign tags and ad-click IDs are the only query params GA may
// see. Any other one might carry a secret or an email
// (/login?next=/join/<token>, ?code=, ?email=), so it keeps GA off.
const GA_SAFE_PARAM = /^(utm_[a-z]+|gclid|gbraid|wbraid|fbclid|msclkid)$/;

export function isGaAllowed(pathname: string, searchParams: URLSearchParams): boolean {
  if (!GA_PATHS.has(pathname)) return false;
  return Array.from(searchParams.keys()).every((key) => GA_SAFE_PARAM.test(key));
}

/** gtag.js sends nothing while `window[gaDisableKey(id)]` is true. */
export function gaDisableKey(gaId: string): string {
  return `ga-disable-${gaId}`;
}
