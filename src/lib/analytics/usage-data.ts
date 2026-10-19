// "Share usage data": a per-device choice on My account, on by default.
// Stored here rather than only in PostHog, so it holds while PostHog is
// off (dev, before the key is set) and is read before PostHog starts,
// letting a coach who opted out start opted out.

export const USAGE_DATA_STORAGE_KEY = "siren-usage-data-v1";

/**
 * A copy of the choice the server can read, so the lifecycle events
 * sent from server actions (src/lib/analytics/server.ts) honour it too.
 * Set only when usage data is off.
 */
export const USAGE_DATA_COOKIE = "siren-usage-data";

/** Mirror the choice into USAGE_DATA_COOKIE. */
export function syncShareUsageDataCookie(share: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = share
    ? `${USAGE_DATA_COOKIE}=; path=/; max-age=0; samesite=lax`
    : `${USAGE_DATA_COOKIE}=off; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
}

export function readShareUsageData(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(USAGE_DATA_STORAGE_KEY) !== "off";
  } catch {
    // localStorage can throw in private-mode Safari and some WebViews.
    return true;
  }
}

export function writeShareUsageData(share: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (share) window.localStorage.removeItem(USAGE_DATA_STORAGE_KEY);
    else window.localStorage.setItem(USAGE_DATA_STORAGE_KEY, "off");
  } catch {
    // see above
  }
}
