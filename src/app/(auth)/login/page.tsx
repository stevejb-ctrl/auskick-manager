import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginScreen } from "@/components/auth/LoginScreen";

export const metadata: Metadata = {
  alternates: { canonical: "/login" },
};

/**
 * Unified email-first login. Rendered full-bleed — the (auth) layout
 * is a pass-through, so this page owns the entire viewport.
 *
 * Suspense wraps the screen because the inner LoginForm uses
 * useSearchParams (to honour `?next=`) and Next.js requires a
 * Suspense boundary for that hook on statically-prerendered pages.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
