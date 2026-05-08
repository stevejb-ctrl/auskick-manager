import "server-only";

// ─── Server-side push dispatcher ──────────────────────────────
//
// Thin wrapper around the send-push Edge Function. Used by server
// actions and cron handlers that have access to the service-role
// key. Never importable from client components — the
// "server-only" import would crash a client bundle.
//
// Errors are swallowed by design: a failed push must not roll
// back the user-visible action that triggered it. We log enough
// to diagnose missing env / Function deploy issues but otherwise
// stay out of the way.

interface PushPayload {
  user_id: string;
  title: string;
  body: string;
  /**
   * Optional string→string map carried alongside the
   * notification. Used by the client to deep-link on tap (e.g.
   * `{ team_id: "..." }` so the Capacitor listener can route to
   * `/teams/<team_id>` when the user opens the notification).
   */
  data?: Record<string, string>;
}

export async function sendPushNotification(
  payload: PushPayload,
): Promise<{ ok: boolean; sent?: number; failed?: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Env not set — function isn't deployed yet, or we're in a
    // local dev shell that hasn't loaded `.env.local`. Fail
    // softly so the trigger callsite keeps working.
    return { ok: false };
  }

  try {
    const resp = await fetch(`${url}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      // 5-second cap — this runs inside a server action so a
      // stalled request would visibly delay the user.
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      console.warn(
        "[push] send-push returned",
        resp.status,
        await resp.text().catch(() => "<no body>"),
      );
      return { ok: false };
    }
    const json = await resp.json();
    return { ok: true, sent: json.sent, failed: json.failed };
  } catch (err) {
    console.warn("[push] send-push fetch failed:", err);
    return { ok: false };
  }
}
