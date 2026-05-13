"use client";

import { useState } from "react";
import { signInWithOAuth } from "@/lib/auth/signInWithOAuth";
import { isNative } from "@/lib/platform";
import { PulseDot } from "@/components/ui/PulseDot";

interface AppleSignInButtonProps {
  /** Same-origin path to land on after the OAuth round-trip. */
  next: string;
  /** Label — Apple HIG accepts "Continue with Apple" or "Sign in with Apple". */
  label?: string;
}

// Apple HIG: black button, white Apple-mark + label, minimum 44pt
// touch height. iOS App Review (guideline 4.8) requires Sign in with
// Apple to appear *alongside* any other social login (Google, etc.)
// when the app supports them on iOS, which is why this lives next
// to GoogleSignInButton in LoginForm.
export function AppleSignInButton({
  next,
  label = "Continue with Apple",
}: AppleSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    const { error } = await signInWithOAuth("apple", next);
    if (error) {
      setError(error);
      setLoading(false);
      return;
    }
    if (isNative()) setLoading(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-black bg-black px-4 py-2 text-sm font-medium text-white shadow-card transition-colors duration-fast ease-out-quart hover:bg-[#1a1a1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={label}
      >
        <AppleMark className="h-4 w-4" />
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
      <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516.024.034 1.52.087 2.475-1.258.955-1.345.762-2.391.728-2.43Zm3.314 11.733c-.048-.096-2.325-1.234-2.113-3.422.212-2.189 1.675-2.789 1.698-2.854.023-.065-.597-.79-1.254-1.157a3.692 3.692 0 0 0-1.563-.434c-.108-.003-.483-.095-1.254.116-.508.139-1.653.589-1.968.607-.316.018-1.256-.522-2.267-.665-.647-.125-1.333.131-1.824.328-.49.196-1.422.754-2.074 2.237-.652 1.482-.311 3.83-.067 4.56.244.729.625 1.924 1.273 2.796.576.984 1.34 1.667 1.659 1.899.319.232 1.219.386 1.843.067.502-.308 1.408-.485 1.766-.472.357.013 1.061.154 1.782.539.571.197 1.111.115 1.652-.105.541-.221 1.324-1.059 2.238-2.758.347-.79.505-1.217.473-1.282Z" />
    </svg>
  );
}
