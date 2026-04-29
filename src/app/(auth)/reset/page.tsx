import { Suspense } from "react";
import { AuthCardShell } from "@/components/auth/AuthCardShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthCardShell>
      <h2 className="mb-6 text-center text-xl font-semibold text-ink">
        Set a new password
      </h2>
      {/* Suspense boundary keeps the page shell statically prerendered;
          the form hydrates on the client where Supabase env vars are
          available. */}
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthCardShell>
  );
}
