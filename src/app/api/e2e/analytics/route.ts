import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { POSTHOG_TEST_COOKIE } from "@/lib/analytics/posthog-server";
import { debugServerEvents } from "@/lib/analytics/server";

// e2e only: the lifecycle events src/lib/analytics/server.ts would
// have sent, so e2e/tests/posthog-analytics.spec.ts can check them.
// Playwright can't see a request the server makes, so in debug mode
// the server keeps them in memory instead. Production always 404s,
// and so does any request without the e2e PostHog cookie.

export const dynamic = "force-dynamic";

export function GET() {
  if (process.env.VERCEL_ENV === "production" || cookies().get(POSTHOG_TEST_COOKIE)?.value !== "1") {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json(debugServerEvents());
}
