import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AuthMethods } from "@/components/auth/AuthMethods";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return (
    <>
      <h2 className="mb-6 text-center text-xl font-semibold text-ink">
        Sign in
      </h2>
      {/* Suspense boundaries isolate useSearchParams() so the page shell
          can be statically prerendered — the inner forms hydrate with
          the real ?next= value on the client. */}
      <Suspense fallback={null}>
        <AuthMethods mode="login" />
      </Suspense>
      <div className="mt-4">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-3 text-center text-xs text-ink-mute">
        <Link
          href="/forgot-password"
          className="transition-colors duration-fast ease-out-quart hover:text-ink-dim"
        >
          Forgot your password?
        </Link>
      </p>
    </>
  );
}
