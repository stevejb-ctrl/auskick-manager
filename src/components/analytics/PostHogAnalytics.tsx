"use client";

import { useEffect } from "react";
import { identifyUser, setTeamContext, startAnalytics } from "@/lib/analytics/client";
import type { AnalyticsSport } from "@/lib/analytics/events";
import type { TeamRole } from "@/lib/types";

/**
 * Starts PostHog product analytics. The root layout renders this only
 * where src/lib/analytics/posthog-server.ts allows: the production
 * deploy, or e2e debug mode. The privacy settings are in
 * src/lib/analytics/posthog-config.ts.
 */
export function PostHogAnalytics({
  apiKey,
  debug,
  appVersion,
}: {
  apiKey: string;
  debug: boolean;
  appVersion: string | null;
}) {
  useEffect(() => {
    startAnalytics({ apiKey, debug, appVersion });
  }, [apiKey, debug, appVersion]);
  return null;
}

/**
 * Tags every event with the team's sport and the coach's role in it
 * (super properties), while the team's pages are open. Rendered by the
 * team layout; leaving the team clears both.
 */
export function AnalyticsTeamContext({ sport, teamRole }: { sport: AnalyticsSport; teamRole: TeamRole | null }) {
  useEffect(() => {
    setTeamContext({ sport, teamRole });
    return () => setTeamContext(null);
  }, [sport, teamRole]);
  return null;
}

/**
 * Links events to the signed-in coach by Supabase id: never a name or
 * an email. Rendered by the (app) layout, which already has the user.
 * Safe before PostHog starts (it waits) or when it's off (no-op).
 */
export function AnalyticsIdentify({ userId }: { userId: string }) {
  useEffect(() => {
    identifyUser(userId);
  }, [userId]);
  return null;
}
