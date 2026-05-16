import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <>
      <h2 className="mb-6 text-center text-2xl font-bold tracking-tightest leading-none text-ink">
        Reset your password
      </h2>
      {/* Suspense boundary keeps the page shell statically prerendered;
          the form hydrates on the client where Supabase env vars are
          available. */}
      <Suspense fallback={null}>
        <ForgotPasswordForm />
      </Suspense>
    </>
  );
}
