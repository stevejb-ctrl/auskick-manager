// ─── send-push ──────────────────────────────────────────────────
// Sends a push notification to every device a Supabase user has
// registered in device_tokens. Service-role-only — caller must be
// either another Supabase Edge Function, a Vercel server action
// using the service-role key, or a database webhook.
//
// Request body:
//   {
//     "user_id": "uuid",
//     "title":   "string",
//     "body":    "string",
//     "data":    { "k": "v", ... }   // optional, must be string→string
//   }
//
// Response:
//   { ok: true, sent: <int>, failed: <int>, errors?: [string] }
//
// FCM v1 only for now — APNs lands when iOS scaffolds. iOS rows in
// device_tokens are ignored silently rather than erroring, so the
// rest of the contract stays stable.
//
// Required Supabase secrets:
//   SUPABASE_URL                    — auto-populated
//   SUPABASE_SERVICE_ROLE_KEY       — auto-populated
//   FIREBASE_SERVICE_ACCOUNT_JSON   — full Firebase service-account
//                                     JSON (single line). Generate
//                                     in Firebase Console → Project
//                                     settings → Service accounts →
//                                     Generate new private key.
//
// Set with:
//   supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON="$(cat firebase-sa.json)"

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface PushRequest {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

// ─── Crypto helpers ───────────────────────────────────────────

function base64url(input: string | Uint8Array): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

// ─── FCM access-token exchange ────────────────────────────────
// Google's OAuth 2.0 service-account flow: sign a JWT with the
// service-account private key, POST to oauth2.googleapis.com/token,
// receive an access_token good for 1 hour.

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  // Cache across function-instance reuse — Supabase Edge runtime
  // keeps modules warm across requests for ~minutes.
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.value;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const signingInput =
    base64url(JSON.stringify(header)) +
    "." +
    base64url(JSON.stringify(payload));

  const key = await importRsaPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = signingInput + "." + base64url(new Uint8Array(sig));

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" +
      encodeURIComponent(jwt),
  });
  if (!resp.ok) {
    throw new Error(`FCM token exchange failed: ${await resp.text()}`);
  }
  const json = await resp.json();
  cachedToken = {
    value: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600),
  };
  return cachedToken.value;
}

// ─── FCM v1 send ──────────────────────────────────────────────

interface FcmResult {
  ok: boolean;
  error?: string;
  invalidToken?: boolean;
}

async function sendFcm(
  accessToken: string,
  projectId: string,
  payload: {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  },
): Promise<FcmResult> {
  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token: payload.token,
          notification: { title: payload.title, body: payload.body },
          // FCM v1 requires data values to be strings.
          data: payload.data,
        },
      }),
    },
  );

  if (resp.ok) return { ok: true };

  const errText = await resp.text();
  // FCM signals an unregistered/invalid token via 404 NOT_FOUND or
  // 400 INVALID_ARGUMENT with errorCode UNREGISTERED. We treat
  // both as "the device token is dead, prune it."
  const invalidToken =
    resp.status === 404 ||
    /UNREGISTERED|INVALID_ARGUMENT/i.test(errText);
  return { ok: false, error: errText, invalidToken };
}

// ─── Request handler ──────────────────────────────────────────

Deno.serve(async (req) => {
  // Service-role-only. The Supabase Functions runtime injects
  // SUPABASE_SERVICE_ROLE_KEY automatically, and Functions
  // already require an apikey header that matches the project's
  // anon or service key. We additionally enforce that the
  // *service* key is what was passed, so anon-key callers get a
  // 401 even though Supabase let them reach the function.
  const auth = req.headers.get("authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: PushRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  if (
    typeof body.user_id !== "string" ||
    typeof body.title !== "string" ||
    typeof body.body !== "string"
  ) {
    return jsonResponse({ error: "invalid_body" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey,
  );

  const { data: tokens, error: tokensErr } = await supabase
    .from("device_tokens")
    .select("platform, token")
    .eq("user_id", body.user_id);

  if (tokensErr) {
    return jsonResponse({ error: tokensErr.message }, 500);
  }
  if (!tokens || tokens.length === 0) {
    return jsonResponse({ ok: true, sent: 0, failed: 0 }, 200);
  }

  const saRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!saRaw) {
    return jsonResponse(
      { error: "missing_firebase_service_account" },
      500,
    );
  }
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(saRaw);
  } catch {
    return jsonResponse({ error: "invalid_firebase_service_account" }, 500);
  }

  const accessToken = await getFcmAccessToken(sa).catch((e) => {
    console.error("[send-push] token exchange failed:", e);
    return null;
  });
  if (!accessToken) {
    return jsonResponse({ error: "fcm_token_exchange_failed" }, 500);
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const deadTokens: string[] = [];

  for (const row of tokens) {
    if (row.platform !== "android") {
      // iOS lands when APNs is wired in slice 4 follow-up. Skip
      // silently for now so iOS users don't get spurious errors
      // bubbling up the call chain.
      continue;
    }
    const result = await sendFcm(accessToken, sa.project_id, {
      token: row.token,
      title: body.title,
      body: body.body,
      data: body.data,
    });
    if (result.ok) {
      sent++;
    } else {
      failed++;
      if (result.error) errors.push(result.error);
      if (result.invalidToken) deadTokens.push(row.token);
    }
  }

  // Prune tokens FCM said are dead. Best-effort; don't block the
  // response on the delete.
  if (deadTokens.length > 0) {
    await supabase
      .from("device_tokens")
      .delete()
      .in("token", deadTokens)
      .then(({ error }) => {
        if (error) {
          console.error("[send-push] dead-token prune failed:", error);
        }
      });
  }

  return jsonResponse(
    {
      ok: true,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    },
    200,
  );
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
