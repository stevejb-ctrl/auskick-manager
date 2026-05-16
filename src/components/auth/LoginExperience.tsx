"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { AppleSignInButton } from "@/components/auth/AppleSignInButton";
import { LoginForm } from "@/components/auth/LoginForm";

// Only follow `next` if it's a same-origin path — never an absolute URL.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

/**
 * The login flow: Google + Apple OAuth on top, magic-link as the
 * primary email path, password as a togglable fallback. "Trouble
 * signing in?" routes to /forgot-password.
 *
 * Magic link is the default because most parents who arrive here came
 * from a /run share link or an invite email — they don't have a
 * password yet and don't want one. Password sign-in is kept one tap
 * away for coaches who do have one.
 */
export function LoginExperience() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [usePassword, setUsePassword] = useState(false);

  return (
    <div className="space-y-5">
      {usePassword ? (
        <LoginForm />
      ) : (
        <>
          <div className="space-y-3">
            <GoogleSignInButton next={next} label="Continue with Google" />
            <AppleSignInButton next={next} label="Continue with Apple" />
          </div>

          <Divider label="or with email" />

          <MagicLinkPanel next={next} />
        </>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm">
        <button
          type="button"
          onClick={() => setUsePassword((v) => !v)}
          className="font-medium text-ink underline-offset-4 transition-colors duration-fast ease-out-quart hover:text-accent hover:underline"
        >
          {usePassword
            ? "Use an email sign-in link instead"
            : "Sign in with password instead"}
        </button>
        <Link
          href="/forgot-password"
          className="font-medium text-ink-dim underline-offset-4 transition-colors duration-fast ease-out-quart hover:text-accent hover:underline"
        >
          Trouble signing in?
        </Link>
      </div>
    </div>
  );
}

// Inline magic-link form — separate from MagicLinkForm so its copy and
// chrome can follow the mockup exactly (uppercase EMAIL label, single
// "Continue" CTA, lock-icon disclaimer) without disturbing the version
// used on /signup.
function MagicLinkPanel({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="rounded-md border border-hairline bg-surface-alt px-4 py-3 text-sm text-ink">
        <p className="font-medium">Check your inbox.</p>
        <p className="mt-1 text-ink-dim">
          We sent a sign-in link to <strong>{email}</strong>. Open it on this
          device to continue.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label
          htmlFor="login-email"
          className="font-mono text-[10px] font-bold uppercase tracking-banner text-ink-mute"
        >
          Email
        </Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="ink"
        size="lg"
        loading={loading}
        disabled={!email}
        className="w-full"
      >
        Continue
      </Button>

      <p className="flex items-start gap-2 text-xs text-ink-dim">
        <LockIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>
          We&rsquo;ll email you a sign-in link. New email? You&rsquo;ll be
          invited to set up a team. No password to remember.
        </span>
      </p>
    </form>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="relative flex items-center">
      <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
      <span className="px-3 font-mono text-[10px] font-bold uppercase tracking-banner text-ink-mute">
        {label}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
    </div>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V4.5a2.5 2.5 0 015 0V7" strokeLinecap="round" />
    </svg>
  );
}
