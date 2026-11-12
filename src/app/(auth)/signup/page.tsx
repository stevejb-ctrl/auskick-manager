import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { loginContextFor } from "@/lib/auth/loginContext";

export const metadata: Metadata = {
  title: "Create your team · Siren",
  description:
    "Set up your junior team on Siren: enter your email and the link we send creates your account. Rotations, subs and scores on game day.",
  alternates: { canonical: "/signup" },
};

interface SignupPageProps {
  searchParams?: { next?: string };
}

/**
 * Sign-up: where the demo game's "Create your team" and /demo's link
 * land (Steve, round 12: it read as signing in). The same email-first
 * flow as /login, since Supabase's `signInWithOtp` creates the account
 * on the first link click; LoginScreen just tells it as setting up a
 * team, with a way back to sign in. Signed-in users never get here:
 * the middleware sends them on, as it does from /login.
 *
 * Joining a team (?next= an invite or the team-code page) isn't setting
 * one up, so it goes to /login, which tells the joining story. Any
 * other `next` stays on the URL for LoginForm to honour after sign-in.
 *
 * SignupForm.tsx is dormant — it's no longer rendered, but kept on
 * disk until we decide what to do with the Telegram notifySignup
 * hook (move to a Supabase user.created webhook, or drop).
 */
export default function SignupPage({ searchParams }: SignupPageProps) {
  const next = searchParams?.next;
  if (next && next.startsWith("/") && !next.startsWith("//") && loginContextFor(next).kind !== "default") {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  return (
    <Suspense fallback={null}>
      <LoginScreen intent="signup" />
    </Suspense>
  );
}
