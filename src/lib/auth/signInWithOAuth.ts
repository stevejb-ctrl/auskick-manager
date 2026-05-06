import { createClient } from "@/lib/supabase/client";
import { isNative, publicOrigin } from "@/lib/platform";

export type OAuthProvider = "google" | "apple";

interface Result {
  /** Null on success; user-facing message on failure. */
  error: string | null;
}

// ─── Shared OAuth entry point for Google + Apple ──────────────
//
// Web: hands control to Supabase; the page is replaced with the
//      provider's auth URL.
//
// Native (Capacitor): can't let the WebView navigate away — Google
//      blocks embedded WebView user-agents, and the deep-link
//      bridge needs the WebView to stay on the app's origin so
//      cookies set by /auth/callback persist after the bounce.
//      Instead we ask Supabase for the URL (skipBrowserRedirect),
//      open it in the *system* browser via @capacitor/browser, and
//      configure redirectTo=siren://auth/callback so the OS will
//      route the eventual code back to the app via NativeAuthBridge.
//
// `next` is a same-origin path the user wanted to land on after
// sign-in (e.g. /dashboard or a deep link). Validated by the
// caller via safeNext() before reaching here.
export async function signInWithOAuth(
  provider: OAuthProvider,
  next: string,
): Promise<Result> {
  const supabase = createClient();

  if (isNative()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `siren://auth/callback?next=${encodeURIComponent(next)}`,
        skipBrowserRedirect: true,
      },
    });
    if (error) return { error: error.message };
    if (!data?.url) return { error: "No OAuth URL returned by Supabase." };

    // Dynamic import — keeps @capacitor/browser out of the web
    // bundle for users who never touch the native shell.
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: data.url, presentationStyle: "popover" });
    return { error: null };
  }

  // Web — Supabase will redirect the current page itself. Use
  // publicOrigin() so brand-aware hosts (sirenfooty vs sirennetball)
  // each round-trip through their own /auth/callback.
  const redirectTo = `${publicOrigin()}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
  return { error: error ? error.message : null };
}
