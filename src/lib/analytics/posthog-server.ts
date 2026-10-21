import { cookies } from "next/headers";

/**
 * The PostHog project key (phc_…): project 673083 in PostHog's US
 * cloud. Not a secret: it ships in every page, like the GA ID. Set it
 * to "" to switch PostHog off in production.
 */
export const POSTHOG_KEY = "phc_vQB8QVJn5PfFHNv7tLLsoR8yoxrHXftjMKJefLzn62K2";

/** The same project's id, for PostHog's private API (deleting a person). */
export const POSTHOG_PROJECT_ID = 673083;

// e2e only. Outside production, a request carrying this cookie runs
// PostHog in debug mode with a dummy key. e2e/tests/posthog-analytics.spec.ts
// catches every /ingest request, so nothing reaches PostHog. Production
// ignores the cookie.
export const POSTHOG_TEST_COOKIE = "siren-e2e-posthog";
const POSTHOG_TEST_KEY = "phc_e2e_dummy_key";

export interface PostHogSettings {
  apiKey: string;
  debug: boolean;
}

/**
 * How to run PostHog for this request, or null for not at all. Only the
 * production deploy gets the real key: never `next dev` or a preview
 * deploy.
 */
export function posthogSettings(): PostHogSettings | null {
  if (process.env.VERCEL_ENV === "production") {
    return POSTHOG_KEY ? { apiKey: POSTHOG_KEY, debug: false } : null;
  }
  if (cookies().get(POSTHOG_TEST_COOKIE)?.value === "1") {
    return { apiKey: POSTHOG_TEST_KEY, debug: true };
  }
  return null;
}
