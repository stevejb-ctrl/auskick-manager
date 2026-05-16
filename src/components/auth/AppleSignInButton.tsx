"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface AppleSignInButtonProps {
  /** Same-origin path to land on after the OAuth round-trip. */
  next: string;
  /** Apple's brand guidelines accept "Continue with Apple" / "Sign in
   *  with Apple" / "Sign up with Apple". Pick one per context. */
  label?: string;
}

// Black slab with the Apple glyph in white. Mirrors GoogleSignInButton
// in shape; the visual register is intentionally distinct (black vs.
// white) per Apple's Sign in with Apple HIG. Provider is enabled on
// the production Supabase project.
export function AppleSignInButton({
  next,
  label = "Continue with Apple",
}: AppleSignInButtonProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // Successful start → browser is navigating away.
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-warm shadow-card transition-colors duration-fast ease-out-quart hover:bg-ink-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={label}
      >
        <AppleMark className="h-4 w-4" />
        <span>{label}</span>
      </button>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function AppleMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path d="M11.624 8.43c-.011-1.793 1.466-2.66 1.533-2.701-.836-1.22-2.137-1.388-2.6-1.407-1.107-.112-2.16.652-2.722.652-.561 0-1.426-.635-2.343-.617-1.205.018-2.317.7-2.939 1.778-1.252 2.17-.32 5.376.9 7.137.595.86 1.302 1.825 2.227 1.791.894-.036 1.232-.578 2.314-.578 1.082 0 1.385.578 2.331.561.962-.018 1.572-.876 2.16-1.739.681-.998.962-1.967.978-2.018-.022-.01-1.872-.718-1.89-2.859zM9.84 3.077c.494-.6.827-1.43.736-2.262-.712.03-1.575.475-2.086 1.073-.458.531-.858 1.378-.751 2.196.794.061 1.606-.404 2.1-1.007z" />
    </svg>
  );
}
