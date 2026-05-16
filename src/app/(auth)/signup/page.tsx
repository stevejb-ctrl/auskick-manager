import { Suspense } from "react";
import { AuthMethods } from "@/components/auth/AuthMethods";
import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <>
      <h2 className="mb-6 text-center text-2xl font-bold tracking-tightest leading-none text-ink">
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
