export const dynamic = "force-dynamic";

import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <>
      <h2 className="mb-6 text-center text-xl font-semibold text-ink">
        Sign in
      </h2>
      <LoginForm />
    </>
  );
}
