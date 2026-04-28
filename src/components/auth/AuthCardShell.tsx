import Link from "next/link";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";

interface AuthCardShellProps {
  children: React.ReactNode;
  /** Optional sub-line under the wordmark. Defaults to the app tagline. */
  tagline?: string;
}

/**
 * Small centered-card chrome used by the secondary auth pages
 * (forgot-password, reset). The login page deliberately skips this
 * shell — it owns its own full-screen layout via `<LoginScreen>`.
 *
 * Lifted out of the previous `(auth)/layout.tsx` so the layout can
 * become a pass-through, freeing the login page to fill the viewport
 * without a card boundary breaking the brand-panel design.
 */
export function AuthCardShell({
  children,
  tagline = "Junior AFL team management",
}: AuthCardShellProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-warm px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <SirenWordmark size="md" pulsing />
          <p className="mt-2 text-sm text-ink-dim">{tagline}</p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface px-6 py-8 shadow-card">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-ink-mute">
          <Link href="/help" className="hover:text-ink-dim">
            Help
          </Link>
        </p>
      </div>
    </div>
  );
}
