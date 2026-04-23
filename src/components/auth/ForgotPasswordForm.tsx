"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

// "Forgot password?" → send a Supabase recovery email.
// We always show the same success message regardless of whether the email
// exists — no account enumeration leak.
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Lazy-instantiate so the component can prerender statically
    // without Supabase env vars — the client is only needed on
    // submit.
    const supabase = createClient();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    // Swallow the error intentionally — we don't surface whether the email
    // was on file. Supabase already rate-limits this endpoint.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/reset`,
    });
    setSubmitted(true);
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-hairline bg-surface-alt px-4 py-3 text-sm text-ink">
          <p className="font-medium">Check your inbox.</p>
          <p className="mt-1 text-ink-dim">
            If <strong>{email}</strong> is on file, a reset link is on its way.
          </p>
        </div>
        <p className="text-center text-sm text-ink-dim">
          <Link
            href="/login"
            className="font-medium text-brand-700 transition-colors duration-fast ease-out-quart hover:text-brand-800"
          >
            ← Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-ink-dim">
        Enter your email and we&rsquo;ll send a link to reset your password.
      </p>

      <div className="space-y-1">
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <Button type="submit" loading={loading} className="w-full">
        Send reset link
      </Button>

      <p className="text-center text-sm text-ink-dim">
        <Link
          href="/login"
          className="font-medium text-brand-700 transition-colors duration-fast ease-out-quart hover:text-brand-800"
        >
          ← Back to sign in
        </Link>
      </p>
    </form>
  );
}
