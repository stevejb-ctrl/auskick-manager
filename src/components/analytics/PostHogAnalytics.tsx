"use client";

import { useEffect } from "react";
import { identifyUser, startAnalytics } from "@/lib/analytics/client";

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
