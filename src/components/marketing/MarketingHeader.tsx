import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";

// Auth-aware top nav. If the visitor is already signed in we swap the
// Sign in / Start free pair for a single "Dashboard" link — saves them
// the second round-trip through the auth screens.
export async function MarketingHeader() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-warm/80 backdrop-blur supports-[backdrop-filter]:bg-warm/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Siren home">
          <SirenWordmark size="sm" />
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/demo"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-surface-alt hover:text-ink"
          >
            Try demo
          </Link>
          {user ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-surface-alt hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
              >
                Start free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
