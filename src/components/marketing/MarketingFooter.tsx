import Link from "next/link";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-warm">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-3">
          <SirenWordmark size="sm" />
          <span className="text-xs text-ink-mute">
            Junior Australian rules football game manager
          </span>
        </div>

        <nav className="flex items-center gap-5 text-sm text-ink-dim">
          <Link
            href="/help"
            className="transition-colors duration-fast ease-out-quart hover:text-ink"
          >
            Help
          </Link>
          <Link
            href="/login"
            className="transition-colors duration-fast ease-out-quart hover:text-ink"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="transition-colors duration-fast ease-out-quart hover:text-ink"
          >
            Sign up
          </Link>
          <span className="text-ink-mute">&copy; {year} Siren</span>
        </nav>
      </div>
    </footer>
  );
}
