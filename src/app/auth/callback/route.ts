import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifySignup } from "@/app/(auth)/signup/actions";

// Only follow `next` if it's a same-origin path — never an absolute URL.
// Mirrors the client-side safeNext() in LoginForm/SignupForm so the server
// route can't be used as an open redirect even if a caller hand-crafts the URL.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

// Window in ms within which `last_sign_in_at` is considered to
// "match" `created_at` and the session is treated as a brand-new
// signup. The two stamps are set in the same Supabase RPC so
// they're typically within a few hundred ms of each other; 10s
// gives generous headroom for clock skew + slow callback. A
// returning OAuth user's last_sign_in_at is always many minutes
// (usually months) after created_at, so the threshold is safe to
// keep loose. Steve 2026-05-17.
const NEW_USER_WINDOW_MS = 10_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user) {
      // Detect first-time OAuth signup vs returning OAuth login.
      // Supabase doesn't expose an explicit "is_new_user" flag on
      // exchangeCodeForSession, so we compare the timestamps: a
      // brand-new user has created_at ≈ last_sign_in_at (both
      // stamped during the same signup RPC); a returning user
      // has created_at well in the past. Fire-and-forget the
      // notification — Telegram unavailability must NOT block the
      // redirect that completes auth.
      try {
        const user = data.user;
        const created = new Date(user.created_at ?? 0).getTime();
        const lastSignIn = new Date(user.last_sign_in_at ?? 0).getTime();
        const isFirstTime =
          created > 0 &&
          lastSignIn > 0 &&
          Math.abs(lastSignIn - created) < NEW_USER_WINDOW_MS;
        if (isFirstTime && user.email) {
          // app_metadata.provider is set by Supabase to the OAuth
          // provider name (e.g. "google", "apple"). For an email/
          // password user this would be "email" — but that path
          // doesn't go through this callback, so we'll always see
          // a real OAuth provider here in practice.
          const provider =
            (user.app_metadata as { provider?: string } | undefined)
              ?.provider ?? null;
          notifySignup(user.email, provider ?? undefined).catch((err) => {
            console.error("[auth/callback] notifySignup failed", err);
          });
        }
      } catch (err) {
        // Don't let a notify path failure leak into the auth flow.
        console.error("[auth/callback] new-user detection threw", err);
      }
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
