import type { CaptureResult } from "posthog-js";
import { INDEXABLE_ROUTES } from "@/lib/public-routes";

// ─── Scrubbing analytics events before they leave the device ─
// PostHog's before_send hook runs every event through sanitizeEvent.
// Rules, from the privacy section of .planning/ANALYTICS-SEO-PLAN.md:
//   - Token paths become placeholders. /run/<token> gives live control
//     of a game and /join/<token> is a team invite.
//   - Query strings keep campaign tags and click IDs only. Anything
//     else might be an auth code, an invite in ?next= or an email.
//   - Fragments go entirely: Supabase can put an access token there.
//   - The page title is kept on public pages only, in case an app page
//     ever names a team or a child.

const TOKEN_PATH = /\/(run|join)\/[^/?#]+/g;
const SAFE_PARAM = /^(utm_[a-z]+|gclid|gbraid|wbraid|fbclid|msclkid)$/;
const PUBLIC_PATHS: ReadonlySet<string> = new Set(INDEXABLE_ROUTES.map((r) => r.path));

/** A URL or path with tokens, unsafe query params and the fragment removed. */
export function sanitizeUrl(value: string): string {
  const absolute = /^https?:\/\//i.test(value);
  if (!absolute && !value.startsWith("/")) return value;

  let url: URL;
  try {
    url = new URL(value, "https://placeholder.invalid");
  } catch {
    return value;
  }
  const kept = new URLSearchParams();
  url.searchParams.forEach((v, k) => {
    if (SAFE_PARAM.test(k)) kept.append(k, v);
  });
  const query = kept.toString();
  const path = url.pathname.replace(TOKEN_PATH, "/$1/:token") + (query ? `?${query}` : "");
  return absolute ? `${url.origin}${path}` : path;
}

function scrub(value: unknown): unknown {
  if (typeof value === "string") return sanitizeUrl(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
  }
  return value;
}

/** PostHog before_send: scrub every URL-shaped value in the event. */
export function sanitizeEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  const properties = scrub(event.properties) as CaptureResult["properties"];
  const pathname = typeof properties.$pathname === "string" ? properties.$pathname : null;
  if (!pathname || !PUBLIC_PATHS.has(pathname)) delete properties.title;

  return {
    ...event,
    properties,
    ...(event.$set ? { $set: scrub(event.$set) as CaptureResult["$set"] } : {}),
    ...(event.$set_once ? { $set_once: scrub(event.$set_once) as CaptureResult["$set_once"] } : {}),
  };
}
