"use client";

import { useState } from "react";
import { signInWithOAuth } from "@/lib/auth/signInWithOAuth";
import { isNative } from "@/lib/platform";
import { PulseDot } from "@/components/ui/PulseDot";

interface GoogleSignInButtonProps {
  /** Same-origin path to land on after the OAuth round-trip. */
  next: string;
  /** Label — "Continue with Google" for both login and signup feels right. */
  label?: string;
}

// White button with the Google "G" mark. Google brand guidelines require the
// mark on a white surface with a visible border and not-too-small touch target.
export function GoogleSignInButton({
  next,
  label = "Continue with Google",
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    const { error } = await signInWithOAuth("google", next);
    if (error) {
      setError(error);
      setLoading(false);
      return;
    }
    // Web: Supabase navigated the page away — leave loading=true so
    // the button stays disabled while the redirect resolves.
    // Native: the system browser is on top of the app. Reset loading
    // so the button is usable again if the user cancels back.
    if (isNative()) setLoading(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-hairline bg-white px-4 py-2 text-sm font-medium text-[#3c4043] shadow-card transition-colors duration-fast ease-out-quart hover:bg-[#f8f9fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={label}
      >
        <GoogleGMark className="h-4 w-4" />
        <span>{label}</span>
        {loading && <PulseDot size="sm" />}
      </button>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleGMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8436 2.0782-1.7973 2.7164v2.2582h2.9086c1.7018-1.5668 2.6855-3.874 2.6855-6.6151z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9086-2.2582c-.806.54-1.8368.8591-3.0477.8591-2.344 0-4.3282-1.5832-5.0364-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.9636 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9573C.3473 6.1732 0 7.5477 0 9s.3473 2.8268.9573 4.0418L3.9636 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4545 3.4405 1.3459l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9636 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"
      />
    </svg>
  );
}
