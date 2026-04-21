"use client";

import { useSearchParams } from "next/navigation";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { MagicLinkForm } from "@/components/auth/MagicLinkForm";

interface AuthMethodsProps {
  mode: "login" | "signup";
}

// Only follow `next` if it's a same-origin path — never an absolute URL.
// Mirrors the same helper in LoginForm/SignupForm.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

/**
 * Stacks the two "easy" auth methods above the email/password form:
 *   1. Continue with Google  (OAuth round-trip)
 *   2. Email me a sign-in link  (magic link / OTP)
 * Followed by a divider that hands off to the email/password form below.
 *
 * Both methods honour `?next=<path>` so you can deep-link the invite flow
 * (e.g. /join/<token>) through login and back.
 */
export function AuthMethods({ mode }: AuthMethodsProps) {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const googleLabel =
    mode === "signup" ? "Sign up with Google" : "Continue with Google";

  return (
    <div className="space-y-4">
      <GoogleSignInButton next={next} label={googleLabel} />

      <Divider label="or" />

      <MagicLinkForm next={next} />

      <Divider label="or use a password" />
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="relative flex items-center">
      <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
      <span className="px-3 text-[11px] font-semibold uppercase tracking-micro text-ink-mute">
        {label}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
    </div>
  );
}
