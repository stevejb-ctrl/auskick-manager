export const dynamic = "force-dynamic";

import Link from "next/link";
import { AuthMethods } from "@/components/auth/AuthMethods";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <>
      <h2 className="mb-6 text-center text-xl font-semibold text-ink">
        Sign in
      </h2>
      <AuthMethods mode="login" />
      <div className="mt-4">
        <LoginForm />
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
