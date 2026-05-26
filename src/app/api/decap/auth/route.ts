// Decap CMS OAuth proxy — STEP 1 of 2: redirect to GitHub.
//
// Decap can't hold the GitHub OAuth client SECRET safely (it's a
// browser-side app), so it relies on a server-side proxy to do the
// OAuth dance. This file is the "kick off the flow" half; the
// other half lives at `../callback/route.ts`.
//
// Flow:
//   1. Decap admin UI (at /admin) opens a popup to
//      `/api/decap/auth?provider=github&scope=repo&site_id=...`
//   2. We redirect the popup to GitHub's authorize endpoint with
//      our client ID + a random state token (CSRF guard).
//   3. User signs in to GitHub, approves the repo scope.
//   4. GitHub redirects back to /api/decap/callback with ?code=...
//   5. Callback exchanges the code for an access token and posts
//      the token back to Decap via window.postMessage.
//
// Required env vars (set in Vercel dashboard):
//   GITHUB_OAUTH_CLIENT_ID     — public, the OAuth app's client id
//   GITHUB_OAUTH_CLIENT_SECRET — private, used in step 4 only
//
// See docs/cms-setup.md for the GitHub OAuth App registration.

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
// Don't cache — OAuth state must be fresh per call.
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GITHUB_OAUTH_CLIENT_ID is not set" },
      { status: 500 },
    );
  }

  // Decap passes the requested scope through — for the github
  // backend it's "repo". We don't trust it blindly: clamp to known
  // values so a misconfigured admin page can't request, say,
  // `admin:org`.
  const requestedScope = req.nextUrl.searchParams.get("scope") ?? "repo";
  const scope = ["repo", "public_repo"].includes(requestedScope)
    ? requestedScope
    : "repo";

  // CSRF guard — round-trip a random state through GitHub and
  // verify it in the callback. Stored in an httpOnly cookie so
  // the browser sends it back automatically; not readable by JS.
  const state = randomBytes(16).toString("hex");

  const callbackUrl = new URL("/api/decap/callback", req.url);
  const githubAuthorize = new URL("https://github.com/login/oauth/authorize");
  githubAuthorize.searchParams.set("client_id", clientId);
  githubAuthorize.searchParams.set("redirect_uri", callbackUrl.toString());
  githubAuthorize.searchParams.set("scope", scope);
  githubAuthorize.searchParams.set("state", state);

  const response = NextResponse.redirect(githubAuthorize.toString());
  response.cookies.set("decap_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/decap",
    maxAge: 600, // 10 minutes — plenty for the round-trip.
  });
  return response;
}
