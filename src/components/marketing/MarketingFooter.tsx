import Link from "next/link";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";

export function MarketingFooter() {
  const year = new Date().getFullYear();
  const brand = getBrand();
  const copy = getBrandCopy(brand.id);
  return (
    <footer className="bg-warm">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-3">
          <SirenWordmark size="sm" />
          <span className="text-xs text-ink-mute">
            {copy.tagline}
          </span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-dim">
          <Link
            href="/why-siren"
            className="transition-colors duration-fast ease-out-quart hover:text-ink"
          >
            Why Siren
          </Link>
          <Link
            href="/help"
            className="transition-colors duration-fast ease-out-quart hover:text-ink"
          >
            Help
          </Link>
          <Link
            href="/contact"
            className="transition-colors duration-fast ease-out-quart hover:text-ink"
          >
            Contact
          </Link>
          <Link
            href="/privacy"
            className="transition-colors duration-fast ease-out-quart hover:text-ink"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="transition-colors duration-fast ease-out-quart hover:text-ink"
          >
            Terms
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
