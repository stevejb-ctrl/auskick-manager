"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

interface MagicLinkFormProps {
  /** Same-origin path to land on after the link is clicked. */
  next: string;
}

// Passwordless "email me a link" sign-in. Works for both new and existing
// accounts — Supabase auto-creates a profile on first magic-link if the
// user doesn't exist yet. handle_new_user trigger fills full_name with ""
// in that case; the user can set it from their profile later.
export function MagicLinkForm({ next }: MagicLinkFormProps) {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
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
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="magic-email">Email</Label>
        <Input
          id="magic-email"
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

      <Button type="submit" loading={loading} className="w-full">
        Email me a sign-in link
      </Button>
    </form>
  );
}
