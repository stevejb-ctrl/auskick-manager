// "Share usage data": a per-device choice on My account, on by default.
// Stored here rather than only in PostHog, so it holds while PostHog is
// off (dev, before the key is set) and is read before PostHog starts,
// letting a coach who opted out start opted out.

export const USAGE_DATA_STORAGE_KEY = "siren-usage-data-v1";

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
