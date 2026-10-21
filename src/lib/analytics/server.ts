import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { waitUntil } from "@vercel/functions";
import { PostHog } from "posthog-node";
import { cleanProps, type EventName, type EventProps } from "@/lib/analytics/events";
import { POSTHOG_PROJECT_ID, posthogSettings } from "@/lib/analytics/posthog-server";
import { USAGE_DATA_COOKIE } from "@/lib/analytics/usage-data";

// ─── Lifecycle events, sent from the server ──────────────────
// A team made, a game started or finished: these fire from the server
// action that writes the row, so they're as reliable as the data. The
// live game runs offline, and an event captured on a phone with no
// signal may never be sent.
//
// Same switch as the browser (src/lib/analytics/posthog-server.ts):
// production with a project key, or e2e debug mode, where events are
// kept in memory for the spec to read (src/app/api/e2e/analytics/
// route.ts) and nothing is sent. A coach who switched "Share usage
// data" off on this device, or whose browser asks not to be tracked,
// sends nothing from here either.

/** PostHog's US ingestion host. The browser goes through /ingest. */
const POSTHOG_API_HOST = "https://us.i.posthog.com";

export interface ServerEvent {
  /** The coach's Supabase id, or null for a share-link runner. */
  distinct_id: string | null;
  event: EventName;
  properties: Record<string, string | number | boolean>;
}

const DEBUG_SINK_SIZE = 500;
const sinkHolder = globalThis as typeof globalThis & { __sirenServerEvents?: ServerEvent[] };

/** e2e debug mode: the events "sent" so far, newest last. */
export function debugServerEvents(): ServerEvent[] {
  return (sinkHolder.__sirenServerEvents ??= []);
}

const forgottenHolder = globalThis as typeof globalThis & { __sirenForgottenPeople?: string[] };

/** e2e debug mode: the coaches whose PostHog person would have been deleted. */
export function debugForgottenPeople(): string[] {
  return (forgottenHolder.__sirenForgottenPeople ??= []);
}

/** PostHog's private API (persons), as opposed to the ingestion host. */
const POSTHOG_PRIVATE_HOST = "https://us.posthog.com";

/**
 * Delete a coach's PostHog person and every event they sent: they've
 * asked to delete their account. Uses PostHog's API with the personal
 * API key in POSTHOG_PERSONAL_API_KEY (scopes person:read and
 * person:write). Runs whatever "Share usage data" says, since it only
 * ever removes data. Never throws into the caller.
 */
export function forgetAnalyticsPerson(userId: string): void {
  let settings: ReturnType<typeof posthogSettings>;
  try {
    settings = posthogSettings();
  } catch (err) {
    console.warn("[analytics] person deletion skipped", err);
    return;
  }
  if (!settings) return;
  if (settings.debug) {
    debugForgottenPeople().push(userId);
    return;
  }
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!apiKey) {
    console.warn("[analytics] POSTHOG_PERSONAL_API_KEY isn't set: PostHog person not deleted");
    return;
  }
  const base = `${POSTHOG_PRIVATE_HOST}/api/projects/${POSTHOG_PROJECT_ID}/persons`;
  const auth = { Authorization: `Bearer ${apiKey}` };
  const work = async () => {
    const found = await fetch(`${base}/?distinct_id=${encodeURIComponent(userId)}`, { headers: auth, cache: "no-store" });
    if (!found.ok) throw new Error(`person lookup: ${found.status}`);
    const { results } = (await found.json()) as { results?: { id: string }[] };
    for (const person of results ?? []) {
      const res = await fetch(`${base}/${encodeURIComponent(person.id)}/?delete_events=true`, {
        method: "DELETE",
        headers: auth,
      });
      if (!res.ok) throw new Error(`person delete: ${res.status}`);
    }
  };
  waitUntil(work().catch((err: unknown) => console.error("[analytics] PostHog person not deleted", err)));
}

let client: PostHog | null = null;
function posthogClient(apiKey: string): PostHog {
  // captureImmediate sends at once, so nothing waits in a queue for a
  // serverless function that's about to freeze.
  client ??= new PostHog(apiKey, { host: POSTHOG_API_HOST, flushAt: 1, flushInterval: 0, disableGeoip: true });
  return client;
}

function optedOut(): boolean {
  if (cookies().get(USAGE_DATA_COOKIE)?.value === "off") return true;
  return headers().get("dnt") === "1";
}

/**
 * Properties to send, or a function that works them out (reading the
 * DB, say) after the response. It returns null to send nothing: a demo
 * team, or a repeat of an event already sent.
 */
type PropsSource<E extends EventName> = EventProps<E> | (() => Promise<EventProps<E> | null>);

/**
 * Send one lifecycle event. `distinctId` is the coach's Supabase id;
 * null for a share-link runner, who isn't an account holder, so the
 * event joins no person. Never throws or delays the action that calls
 * it: the work runs after the response, under waitUntil, so serverless
 * doesn't drop it.
 */
export function trackServer<E extends EventName>(distinctId: string | null, event: E, source: PropsSource<E>): void {
  let settings: ReturnType<typeof posthogSettings>;
  try {
    // Both read the request, so they run before anything is deferred.
    settings = posthogSettings();
    if (!settings || optedOut()) return;
  } catch (err) {
    // Outside a request (cookies() throws): analytics never breaks the action.
    console.warn(`[analytics] ${event} skipped`, err);
    return;
  }
  const { apiKey, debug } = settings;

  const work = async () => {
    const raw = typeof source === "function" ? await source() : source;
    if (!raw) return;
    const { props, problems } = cleanProps(event, raw as Record<string, unknown>);
    if (debug) {
      for (const problem of problems) console.error(`[analytics] ${problem}`);
      const sink = debugServerEvents();
      sink.push({ distinct_id: distinctId, event, properties: props });
      if (sink.length > DEBUG_SINK_SIZE) sink.splice(0, sink.length - DEBUG_SINK_SIZE);
      return;
    }
    await posthogClient(apiKey).captureImmediate({
      distinctId: distinctId ?? randomUUID(),
      event,
      properties: distinctId ? props : { ...props, $process_person_profile: false },
    });
  };
  waitUntil(work().catch((err: unknown) => console.warn(`[analytics] ${event} not sent`, err)));
}
