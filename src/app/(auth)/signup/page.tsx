export const dynamic = "force-dynamic";

import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <>
      <h2 className="mb-6 text-center text-xl font-semibold text-ink">
        Create account
      </h2>
      <SignupForm />
    </>
  );
}
