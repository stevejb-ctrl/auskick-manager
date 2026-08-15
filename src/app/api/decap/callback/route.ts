// Decap CMS OAuth proxy — STEP 2 of 2: exchange code for token,
// post the token back to Decap.
//
// See `../auth/route.ts` for the full flow. By the time this
// handler runs, the user has approved the GitHub OAuth app and
// GitHub has redirected them here with `?code=...&state=...`.
//
// We:
//   1. Verify state matches the cookie we set (CSRF guard).
//   2. POST the code to GitHub's access_token endpoint together
//      with our client secret. Get back a token string.
//   3. Return a tiny HTML page that posts the token back to the
//      Decap popup opener (window.opener.postMessage) and closes
//      the popup. Decap listens for this message format and
//      stores the token in localStorage for subsequent API calls.
//
// Reference: https://decapcms.org/docs/external-oauth-clients/
//   (we're implementing the same protocol as the community OAuth
//   providers, just as in-repo route handlers.)

import { NextResponse, type NextRequest } from "next/server";
import { renderDecapCallbackHtml } from "@/lib/decap/callbackHtml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "GitHub OAuth env vars are not set" },
      { status: 500 },
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const storedState = req.cookies.get("decap_oauth_state")?.value;
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }
  if (!state || !storedState || state !== storedState) {
    // CSRF guard tripped — likely a stale cookie or an attacker
    // sending a forged callback. Refuse and clear the cookie.
    const r = NextResponse.json(
      { error: "State mismatch" },
      { status: 400 },
    );
    r.cookies.delete("decap_oauth_state");
    return r;
  }

  // Exchange the code for an access token.
  const tokenRes = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: new URL("/api/decap/callback", req.url).toString(),
      }),
    },
  );

  const tokenBody = (await tokenRes.json()) as GitHubTokenResponse;
  if (!tokenRes.ok || !tokenBody.access_token) {
    return NextResponse.json(
      {
        error: tokenBody.error_description ?? "Token exchange failed",
      },
      { status: 502 },
    );
  }

  // Post the token back to the Decap popup opener using Decap's
  // documented OAuth handshake:
  //
  //   1. Popup announces it's done by posting "authorizing:github"
  //      to the parent.
  //   2. Parent (Decap) replies with any message — this is the
  //      "I'm listening" acknowledgement.
  //   3. Popup responds by posting
  //      "authorization:github:success:{token,provider}"
  //   4. Parent receives the token, stores it in localStorage,
  //      and closes the popup.
  //
  // The original simpler "post once and close" pattern races:
  // Decap registers its message listener after the popup has
  // already fired and closed, so the message is lost and the
  // login loops. The handshake guarantees the parent is ready.
  //
  // Reference: the netlify-cms-github-oauth-provider community
  // implementation (https://github.com/vencax/netlify-cms-github-
  // oauth-provider) uses this exact protocol; Decap inherits it
  // unchanged from Netlify CMS.
  const payload = JSON.stringify({
    token: tokenBody.access_token,
    provider: "github",
  });
  const successMessage = `authorization:github:success:${payload}`;

  // Render via the extracted, unit-tested builder. It posts the token ONLY
  // to our own origin and ignores messages from foreign openers — see
  // src/lib/decap/callbackHtml.ts for the security rationale (the old inline
  // version echoed the token to e.origin / announced with "*", which let an
  // attacker-controlled opener capture the repo-scoped GitHub token).
  const html = renderDecapCallbackHtml(successMessage);

  const response = new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  // Burn the state cookie so it can't be replayed.
  response.cookies.delete("decap_oauth_state");
  return response;
}
