/**
 * (auth) layout — pass-through.
 *
 * Each auth page owns its own chrome:
 *   - /login  → full-bleed via <LoginScreen> (the redesign)
 *   - /forgot-password, /reset → small centred card via <AuthCardShell>
 *   - /signup → the same <LoginScreen>, told as setting up a team
 *
 * The previous shared centred-card chrome is now lifted into
 * AuthCardShell so the login screen can fill the viewport.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
