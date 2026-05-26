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

  // Post the token back to the Decap popup opener. Message format
  // is Decap's documented protocol:
  //   "authorization:github:success:{\"token\":\"...\",\"provider\":\"github\"}"
  // The string-prefix marker is how Decap distinguishes its OAuth
  // messages from other postMessage chatter.
  //
  // We use `'*'` as the target origin because Decap is served from
  // the same host (/admin) and we just redirected the popup
  // through GitHub and back — at this point the popup is on our
  // origin, and `'*'` lets the message reach Decap regardless of
  // whether Decap is on / or /admin. Safe: opener is locked to
  // sirenfooty.com.au by browser SOP.
  const payload = JSON.stringify({
    token: tokenBody.access_token,
    provider: "github",
  });
  const message = `authorization:github:success:${payload}`;
  // JSON.stringify the message string itself before inlining so it
  // round-trips through HTML safely (escapes quotes, slashes).
  const safeMessage = JSON.stringify(message);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Authorising…</title></head>
<body>
<script>
(function () {
  var msg = ${safeMessage};
  if (window.opener) {
    window.opener.postMessage(msg, "*");
  }
  // Decap also accepts the message via a second postMessage after
  // a handshake — sending it once on load is enough in practice.
  window.close();
})();
</script>
<p>Authorising… You can close this window.</p>
</body></html>`;

  const response = new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  // Burn the state cookie so it can't be replayed.
  response.cookies.delete("decap_oauth_state");
  return response;
}
