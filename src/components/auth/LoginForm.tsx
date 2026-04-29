"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Eyebrow, SFButton } from "@/components/sf";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { LoginField } from "@/components/auth/LoginField";
import { LoginSentState } from "@/components/auth/LoginSentState";

// Only follow `next` if it's a same-origin path — never an absolute URL.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

type Mode = "magic" | "password";

/**
 * Unified email-first login form.
 *
 * Default mode is `magic`: one email field + one Continue button →
 * `signInWithOtp`. Supabase auto-creates a profile on first link
 * click for new users, so this single endpoint serves both sign-in
 * and sign-up. After submit, the form swaps for `<LoginSentState>`
 * with "Check your inbox" + faux email card + Resend.
 *
 * The "Sign in with password instead" link in the form footer toggles
 * `password` mode: a password field appears below the email, the
 * Continue button becomes "Sign in", and the helper line is replaced
 * with a small "Forgot password?" link. The user can flip back via
 * "Use a sign-in link instead".
 *
 * Replaces the previous AuthMethods + MagicLinkForm + LoginForm
 * stack with a single component.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("magic");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sent, setSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentNotice, setResentNotice] = useState(false);

  async function sendMagicLink(forEmail: string) {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
    return supabase.auth.signInWithOtp({
      email: forEmail,
      options: { emailRedirectTo },
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setError(null);

    if (mode === "password") {
      setSubmitting(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setSubmitting(false);
        return;
      }
      router.push(next);
      router.refresh();
      return;
    }

    // magic-link path
    setSubmitting(true);
    const { error } = await sendMagicLink(email);
    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setSent(true);
  }

  async function handleResend() {
    setResending(true);
    setResentNotice(false);
    const { error } = await sendMagicLink(email);
    setResending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setResentNotice(true);
    // Hide the "Resent" confirmation after a short delay.
    setTimeout(() => setResentNotice(false), 3000);
  }

  function handleBack() {
    setSent(false);
    setError(null);
  }

  if (sent) {
    return (
      <LoginSentState
        email={email}
        onBack={handleBack}
        onResend={handleResend}
        resending={resending}
        resentNotice={resentNotice}
      />
    );
  }

  return (
    <div>
      <Eyebrow>Coaches &amp; team managers</Eyebrow>
      <h1
        className="mt-1.5 text-[36px] font-bold tracking-tightest text-ink"
        style={{ lineHeight: 1.05 }}
      >
        Run your team&apos;s{" "}
        <span className="font-serif italic font-normal">season</span>
      </h1>
      <p className="mt-2 mb-6 text-sm leading-relaxed text-ink-dim">
        New or returning, enter your email and we&apos;ll get you in.
        Parents don&apos;t need an account; they just open a share link.
      </p>

      <GoogleSignInButton next={next} />

      <Divider label={mode === "password" ? "OR WITH PASSWORD" : "OR WITH EMAIL"} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <LoginField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          data-testid="login-email"
        />

        {mode === "password" && (
          <LoginField
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            data-testid="login-password"
            hint={
              <Link
                href="/forgot-password"
                className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
              >
                Forgot?
              </Link>
            }
          />
        )}

        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}

        <SFButton
          type="submit"
          variant="primary"
          size="lg"
          full
          disabled={submitting || !email || (mode === "password" && !password)}
          data-testid="login-submit"
        >
          {submitting
            ? mode === "password"
              ? "Signing in…"
              : "Sending link…"
            : mode === "password"
            ? "Sign in"
            : "Continue"}
        </SFButton>

        {mode === "magic" && (
          <p className="mt-0.5 flex items-start gap-2 text-xs leading-snug text-ink-mute">
            <LockIcon />
            <span>
              We&apos;ll email you a sign-in link. New email? You&apos;ll be
              invited to set up a team. No password to remember.
            </span>
          </p>
        )}
      </form>

      <div className="mt-5 flex items-baseline justify-between border-t border-hairline pt-4 text-xs text-ink-dim">
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "magic" ? "password" : "magic"));
            setError(null);
          }}
          className="border-b border-hairline pb-px font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
          data-testid="login-mode-toggle"
        >
          {mode === "magic"
            ? "Sign in with password instead"
            : "Use a sign-in link instead"}
        </button>
        <Link
          href="/forgot-password"
          className="border-b border-hairline pb-px font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
        >
          Trouble signing in?
        </Link>
      </div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink-mute">
      <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
      {label}
      <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-px shrink-0"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
