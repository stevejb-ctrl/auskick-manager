import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <>
      <h2 className="mb-6 text-center text-xl font-semibold text-ink">
        Reset your password
      </h2>
      <ForgotPasswordForm />
    </>
  );
}
