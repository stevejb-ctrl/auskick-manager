import type { PostHogConfig } from "posthog-js";
import { sanitizeEvent } from "@/lib/analytics/sanitize";

// ─── PostHog settings ────────────────────────────────────────
// Squads are lists of children's names, so privacy decides these, not
// PostHog's defaults. src/lib/__tests__/posthogConfig.test.ts pins
// each one; change it there first, on purpose.

/** PostHog's US cloud, through the /ingest rewrite in next.config.mjs. */
export const POSTHOG_PROXY_PATH = "/ingest";
export const POSTHOG_UI_HOST = "https://us.posthog.com";

export function posthogOptions({ debug }: { debug: boolean }): Partial<PostHogConfig> {
  return {
    // Our own domain, so ad blockers don't drop events, and the
    // dashboard links point at the US app.
    api_host: POSTHOG_PROXY_PATH,
    ui_host: POSTHOG_UI_HOST,

    // App-router page changes are pushState, not page loads.
    capture_pageview: "history_change",
    capture_pageleave: true,

    // Taps are captured, but never the words on screen or an element's
    // attributes. A player tile's text, or "Role for <name>" in an
    // aria-label, is a child's name.
    autocapture: true,
    mask_all_text: true,
    mask_all_element_attributes: true,

    // No tokens, auth codes or emails in any URL that's sent.
    before_send: sanitizeEvent,

    // People only exist once a coach signs in, and only as their
    // Supabase id (src/components/analytics/PostHogAnalytics.tsx).
    person_profiles: "identified_only",
    respect_dnt: true,

    // Recording, heatmaps and surveys are off until their own phase,
    // with masking settings of their own.
    disable_session_recording: true,
    enable_heatmaps: false,
    disable_surveys: true,

    // Feature flags are off: we don't use them yet, and the flags
    // request sends person properties ($initial_current_url, the raw
    // first URL, token and all) without passing through before_send.
    advanced_disable_flags: true,

    // Error messages can quote data (a constraint error can name a
    // player), so exceptions stay off until they can be scrubbed too.
    capture_exceptions: false,

    persistence: "localStorage+cookie",

    // e2e reads each event as it's sent: plain JSON, one request each.
    // Playwright's browser reports navigator.webdriver, which PostHog
    // treats as a bot and drops, so debug mode lets it through. Live,
    // bots stay filtered out.
    disable_compression: debug,
    request_batching: !debug,
    opt_out_useragent_filter: debug,
  };
}
