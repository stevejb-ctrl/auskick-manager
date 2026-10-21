import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifySignup } from "@/app/(auth)/signup/actions";
import { trackServer } from "@/lib/analytics/server";
import { isNewSignIn, signupMethod } from "@/lib/auth/newSignIn";

// Only follow `next` if it's a same-origin path — never an absolute URL.
// Mirrors the client-side safeNext() in LoginForm/SignupForm so the server
// route can't be used as an open redirect even if a caller hand-crafts the URL.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user) {
      // A brand-new account's first sign-in (src/lib/auth/newSignIn.ts:
      // Supabase has no is_new_user flag, so the auth stamps decide).
      // Fire-and-forget the notification — Telegram unavailability
      // must NOT block the redirect that completes auth.
      try {
        const user = data.user;
        if (isNewSignIn(user)) {
          // app_metadata.provider: "google" / "apple" for OAuth,
          // "email" for a magic link (which lands here too).
          const provider =
            (user.app_metadata as { provider?: string } | undefined)
              ?.provider ?? null;
          if (user.email) {
            notifySignup(user.email, provider ?? undefined).catch((err) => {
              console.error("[auth/callback] notifySignup failed", err);
            });
          }
          const method = signupMethod(provider);
          if (method) trackServer(user.id, "signup_completed", { method, brand_host: url.host });
        }
      } catch (err) {
        // Don't let a notify path failure leak into the auth flow.
        console.error("[auth/callback] new-user detection threw", err);
      }
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
