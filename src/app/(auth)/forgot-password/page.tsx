import { Suspense } from "react";
import { AuthCardShell } from "@/components/auth/AuthCardShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthCardShell>
      <h2 className="mb-6 text-center text-xl font-semibold text-ink">
        Reset your password
      </h2>
      {/* Suspense boundary keeps the page shell statically prerendered;
          the form hydrates on the client where Supabase env vars are
          available. */}
      <Suspense fallback={null}>
        <ForgotPasswordForm />
      </Suspense>
    </AuthCardShell>
  );
}
