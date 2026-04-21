export const dynamic = "force-dynamic";

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <>
      <h2 className="mb-6 text-center text-xl font-semibold text-ink">
        Set a new password
      </h2>
      <ResetPasswordForm />
    </>
  );
}
