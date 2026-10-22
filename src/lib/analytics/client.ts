import posthog from "posthog-js";
import { currentAnalyticsPlatform } from "@/lib/analytics/platform";
import { posthogOptions } from "@/lib/analytics/posthog-config";
import { readShareUsageData } from "@/lib/analytics/usage-data";

// ─── The one place the app talks to PostHog ──────────────────
// Every call is a no-op until startAnalytics has run, which only
// happens where src/lib/analytics/posthog-server.ts allows it (the
// production deploy, or e2e debug mode). So callers never need to
// check whether analytics is on.

let started = false;
let pendingUserId: string | null = null;

export function startAnalytics(opts: { apiKey: string; debug: boolean; appVersion: string | null }): void {
  if (started || typeof window === "undefined") return;
  started = true;
  posthog.init(opts.apiKey, {
    ...posthogOptions({ debug: opts.debug }),
    // A coach who switched usage data off starts opted out, before the
    // first page view.
    opt_out_capturing_by_default: !readShareUsageData(),
  });
  posthog.register({
    platform: currentAnalyticsPlatform(),
    brand_host: window.location.host,
    ...(opts.appVersion ? { app_version: opts.appVersion } : {}),
  });
  if (pendingUserId) identifyUser(pendingUserId);
}

/** Link this device's events to a signed-in coach, by Supabase id only. */
export function identifyUser(userId: string): void {
  if (!started) {
    pendingUserId = userId;
    return;
  }
  pendingUserId = null;
  if (posthog.get_distinct_id() === userId) return;
  // A different coach was signed in on this device: start this one a
  // fresh identity rather than merging the two. PostHog keeps
  // $user_state across reloads.
  if (posthog.get_property("$user_state") === "identified") posthog.reset();
  posthog.identify(userId);
}

/** Forget the signed-in coach. Call on sign-out. */
export function resetAnalytics(): void {
  pendingUserId = null;
  if (started) posthog.reset();
}

/** Apply the "Share usage data" switch on My account. */
export function applyShareUsageData(share: boolean): void {
  if (!started) return;
  if (share) posthog.opt_in_capturing();
  else posthog.opt_out_capturing();
}
