// ─── /dev/login — local dev auth shortcut ────────────────────
// Visit this route in the browser and you'll be signed in as one
// of the seeded local accounts and redirected. Beats typing a
// password every reload while screenshotting.
//
// Returns 404 in production (NODE_ENV check) so it can never be
// reached on the deployed site even if it leaks past code review.
//
// Usage:
//   /dev/login                          → screenshots user → Bondi Bandits home
//   /dev/login?as=super-admin           → super-admin → Kotara Koalas home
//   /dev/login?as=screenshots&next=/teams/<id>/stats  → custom redirect
//   /dev/login?logout                   → sign out, redirect to /
//
// User accounts come from:
//   - scripts/seed-screenshot-team.mjs (screenshots@siren.local)
//   - supabase/seed.sql                 (super-admin@siren.test)

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Hard-coded constants matching the seed scripts. If either drifts
// the route just 401s; keeping them inline here means we don't
// pull seed-bot internals into the production bundle.
const ACCOUNTS = {
  screenshots: {
    email: "screenshots@siren.local",
    password: "screenshots-pw-12345",
    // Bondi Bandits team id from scripts/seed-screenshot-team.mjs.
    defaultRedirect: "/teams/5c4ee117-0ba1-4c5e-b107-b07b04bdd175",
  },
  "super-admin": {
    email: "super-admin@siren.test",
    password: "test-pw-12345",
    // Kotara Koalas team id from supabase/seed.sql.
    defaultRedirect: "/teams/5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11",
  },
} as const;

type AccountKey = keyof typeof ACCOUNTS;

function notFound() {
  // Match Next's not-found rendering — opaque to crawlers / random
  // hits in case anyone trips over this in CI accidentally.
  return new NextResponse("Not found", { status: 404 });
}

export async function GET(request: NextRequest) {
  // Hard gate on prod. NODE_ENV is "production" on Vercel / `next
  // start`, "development" or "test" everywhere else. Defence-in-
  // depth: we check NODE_ENV first, then also bail if the inbound
  // host doesn't look local (for the rare case of running NODE_ENV=
  // development against a real domain in a tunnel / preview).
  if (process.env.NODE_ENV === "production") {
    return notFound();
  }
  const host = request.headers.get("host") ?? "";
  const isLocal =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("0.0.0.0");
  if (!isLocal) {
    return notFound();
  }

  const params = request.nextUrl.searchParams;
  const supabase = createClient();

  // ?logout — sign out and bounce to root. Useful for testing the
  // unauthenticated marketing surface without swapping browsers.
  if (params.has("logout")) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/", request.url));
  }

  const asParam = (params.get("as") ?? "screenshots") as AccountKey;
  const account = ACCOUNTS[asParam];
  if (!account) {
    return new NextResponse(
      `Unknown account "${asParam}". Try one of: ${Object.keys(ACCOUNTS).join(", ")}`,
      { status: 400 },
    );
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) {
    // Most likely cause: the seed scripts haven't been run yet, so
    // the user doesn't exist. Surface the message rather than a
    // generic 500 so the fix is obvious.
    return new NextResponse(
      `Sign-in failed for ${account.email}: ${error.message}\n\n` +
        `Run \`node scripts/seed-screenshot-team.mjs\` (and/or ` +
        `\`supabase db reset\`) to seed the local accounts.`,
      { status: 401, headers: { "Content-Type": "text/plain" } },
    );
  }

  // Honour ?next= if it's a same-origin path (no scheme, no //).
  // This is the same guard the production middleware uses for
  // post-login redirects — open-redirect prevention.
  const rawNext = params.get("next");
  const safeNext =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : account.defaultRedirect;
  return NextResponse.redirect(new URL(safeNext, request.url));
}
