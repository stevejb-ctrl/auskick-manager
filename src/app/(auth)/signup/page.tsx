import { redirect } from "next/navigation";

interface SignupPageProps {
  searchParams: { next?: string };
}

/**
 * Signup is collapsed into the unified email-first login flow.
 * Supabase's `signInWithOtp` auto-creates a user on first magic-link
 * click, so /login serves both new and returning users.
 *
 * This route stays alive so external links / bookmarks still resolve;
 * we just funnel everyone through /login. The `next` param is
 * preserved so post-auth redirects still work as expected.
 *
 * SignupForm.tsx is dormant — it's no longer rendered, but kept on
 * disk until we decide what to do with the Telegram notifySignup
 * hook (move to a Supabase user.created webhook, or drop).
 */
export default function SignupPage({ searchParams }: SignupPageProps) {
  const next = searchParams.next;
  const target =
    next && next.startsWith("/") && !next.startsWith("//")
      ? `/login?next=${encodeURIComponent(next)}`
      : "/login";
  redirect(target);
}
