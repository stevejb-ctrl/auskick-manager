import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthMethods } from "@/components/auth/AuthMethods";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = {
  alternates: { canonical: "/signup" },
};

export default function SignupPage() {
  return (
    <>
      <h2 className="mb-6 text-center text-xl font-semibold text-ink">
        Create account
      </h2>
      {/* Suspense boundaries isolate useSearchParams() so the page shell
          can be statically prerendered — the inner forms hydrate with
          the real ?next= value on the client. */}
      <Suspense fallback={null}>
        <AuthMethods mode="signup" />
      </Suspense>
      <div className="mt-4">
        <Suspense fallback={null}>
          <SignupForm />
        </Suspense>
      </div>
    </>
  );
}
