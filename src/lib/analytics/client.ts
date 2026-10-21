import posthog from "posthog-js";
import { cleanProps, type AnalyticsSport, type EventName, type EventProps } from "@/lib/analytics/events";
import { currentAnalyticsPlatform } from "@/lib/analytics/platform";
import { posthogOptions } from "@/lib/analytics/posthog-config";
import { readShareUsageData, syncShareUsageDataCookie } from "@/lib/analytics/usage-data";
import type { TeamRole } from "@/lib/types";

// ─── The one place the app talks to PostHog ──────────────────
// Every call is a no-op until startAnalytics has run, which only
// happens where src/lib/analytics/posthog-server.ts allows it (the
// production deploy, or e2e debug mode). So callers never need to
// check whether analytics is on.

let started = false;
let debugMode = false;
let pendingUserId: string | null = null;
// Super properties. `baseProps` describe the device (set at start);
// `contextProps` the page's team or runner link, changed as the coach
// moves around. posthog.reset() drops both, so they're kept here to put
// back.
let baseProps: Record<string, string> = {};
let contextProps: Record<string, string> = {};

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
  baseProps = {
    platform: currentAnalyticsPlatform(),
    brand_host: window.location.host,
    ...(opts.appVersion ? { app_version: opts.appVersion } : {}),
  };
  posthog.register({ ...baseProps, ...contextProps });
  if (pendingUserId) identifyUser(pendingUserId);
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

/** Set (a string) or clear (null) page-context super properties. */
function setContextProps(props: Record<string, string | null>): void {
  for (const [key, value] of Object.entries(props)) {
    if (value === null) {
      delete contextProps[key];
      if (started) posthog.unregister(key);
    } else {
      contextProps[key] = value;
      if (started) posthog.register({ [key]: value });
    }
  }
}

/** posthog.reset(), keeping the device's and the page's super properties. */
function resetIdentity(keepContext: boolean): void {
  posthog.reset();
  if (!keepContext) contextProps = {};
  posthog.register({ ...baseProps, ...contextProps });
}

export interface TeamContext {
  sport: AnalyticsSport;
  /** The coach's role in this team (team_memberships.role). */
  teamRole: TeamRole | null;
}

/**
 * Tag every event with the team's sport and the coach's role in it,
 * while a team's pages are open. Pass null on leaving the team.
 */
export function setTeamContext(team: TeamContext | null): void {
  setContextProps({ sport: team?.sport ?? null, team_role: team?.teamRole ?? null });
}

/**
 * On a /run/<token> page: tag events as a /demo visitor's or a
 * share-link runner's, so game-day numbers can leave the demo out.
 * Pass null on leaving.
 */
export function setRunContext(kind: "demo" | "runner" | null): void {
  setContextProps({ run_link: kind });
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
  if (posthog.get_property("$user_state") === "identified") resetIdentity(true);
  posthog.identify(userId);
}

/**
 * Stop linking this device's events to a coach who has asked to delete
 * their account. Their PostHog person is deleted on the server.
 */
export function forgetUser(): void {
  pendingUserId = null;
  if (started && posthog.get_property("$user_state") === "identified") resetIdentity(true);
}

/** Forget the signed-in coach. Call on sign-out. */
export function resetAnalytics(): void {
  pendingUserId = null;
  if (started) resetIdentity(false);
}

/** Apply the "Share usage data" switch on My account. */
export function applyShareUsageData(share: boolean): void {
  syncShareUsageDataCookie(share);
  if (!started) return;
  if (share) posthog.opt_in_capturing();
  else posthog.opt_out_capturing();
}
