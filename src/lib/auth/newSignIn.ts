// Is this sign-in a brand-new account's first? Supabase has no
// "is_new_user" flag on exchangeCodeForSession, so the auth user's
// timestamps decide:
//   - OAuth (Google, Apple) makes the user and signs them in in one
//     go, so created_at ≈ last_sign_in_at.
//   - A magic link makes the user when the email is SENT and confirms
//     the address when the link is clicked, often minutes later, so
//     there email_confirmed_at ≈ last_sign_in_at instead.
// A returning user's last sign-in is long after both.

/** How close the stamps must be. They're set in one auth call, so 10 s is generous. */
export const NEW_USER_WINDOW_MS = 10_000;

export interface AuthStamps {
  created_at?: string | null;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
}

export function isNewSignIn(user: AuthStamps): boolean {
  const lastSignIn = Date.parse(user.last_sign_in_at ?? "");
  if (Number.isNaN(lastSignIn)) return false;
  return [user.created_at, user.email_confirmed_at].some((stamp) => {
    const at = Date.parse(stamp ?? "");
    return !Number.isNaN(at) && Math.abs(lastSignIn - at) < NEW_USER_WINDOW_MS;
  });
}

/** How the coach signed up, from app_metadata.provider; null for anything else. */
export function signupMethod(provider: unknown): "email" | "google" | "apple" | null {
  return provider === "email" || provider === "google" || provider === "apple" ? provider : null;
}
