import posthog from "posthog-js";
import { cleanProps, type EventName, type EventProps } from "@/lib/analytics/events";
import { currentAnalyticsPlatform } from "@/lib/analytics/platform";
import { posthogOptions } from "@/lib/analytics/posthog-config";
import { readShareUsageData, syncShareUsageDataCookie } from "@/lib/analytics/usage-data";

// ─── The one place the app talks to PostHog ──────────────────
// Every call is a no-op until startAnalytics has run, which only
// happens where src/lib/analytics/posthog-server.ts allows it (the
// production deploy, or e2e debug mode). So callers never need to
// check whether analytics is on.

let started = false;
let debugMode = false;
let pendingUserId: string | null = null;
let pendingTeam: TeamContext | null = null;

export function startAnalytics(opts: { apiKey: string; debug: boolean; appVersion: string | null }): void {
  if (started || typeof window === "undefined") return;
  started = true;
  debugMode = opts.debug;
  const share = readShareUsageData();
  // The server's lifecycle events read the choice from a cookie.
  syncShareUsageDataCookie(share);
  posthog.init(opts.apiKey, {
    ...posthogOptions({ debug: opts.debug }),
    // A coach who switched usage data off starts opted out, before the
    // first page view.
    opt_out_capturing_by_default: !share,
  });
  posthog.register({
    platform: currentAnalyticsPlatform(),
    brand_host: window.location.host,
    ...(opts.appVersion ? { app_version: opts.appVersion } : {}),
  });
  if (pendingUserId) identifyUser(pendingUserId);
  if (pendingTeam) setTeamContext(pendingTeam);
}

/**
 * Send one event from the catalogue (src/lib/analytics/events.ts).
 * A no-op while PostHog is off or the coach has opted out, and it goes
 * through the same before_send scrubber as every other event.
 */
export function track<E extends EventName>(event: E, props: EventProps<E>): void {
  if (!started) return;
  const { props: clean, problems } = cleanProps(event, props as Record<string, unknown>);
  // e2e watches the console: a property that breaks the catalogue's
  // rules fails the spec rather than going quietly missing.
  if (debugMode) for (const problem of problems) console.error(`[analytics] ${problem}`);
  posthog.capture(event, clean);
}

export interface TeamContext {
  sport: string;
  /** The coach's role in this team (team_memberships.role). */
  teamRole: string | null;
}

/**
 * Tag every event with the team's sport and the coach's role in it,
 * while a team's pages are open. Pass null on leaving the team.
 */
export function setTeamContext(team: TeamContext | null): void {
  if (!started) {
    pendingTeam = team;
    return;
  }
  pendingTeam = null;
  if (!team) {
    posthog.unregister("sport");
    posthog.unregister("team_role");
    return;
  }
  posthog.register({ sport: team.sport });
  if (team.teamRole) posthog.register({ team_role: team.teamRole });
  else posthog.unregister("team_role");
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
  syncShareUsageDataCookie(share);
  if (!started) return;
  if (share) posthog.opt_in_capturing();
  else posthog.opt_out_capturing();
}
