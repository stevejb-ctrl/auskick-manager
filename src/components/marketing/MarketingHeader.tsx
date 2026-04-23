import Link from "next/link";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";
import { MarketingAuthCTAs } from "@/components/marketing/MarketingAuthCTAs";

// Pure static header — the auth-aware Dashboard / Sign in CTA is
// isolated in MarketingAuthCTAs (client island) so this whole tree can
// be prerendered at build time.
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-warm/80 backdrop-blur supports-[backdrop-filter]:bg-warm/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Siren home">
          <SirenWordmark size="sm" pulsing />
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/why-siren"
            className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-surface-alt hover:text-ink sm:inline-flex"
          >
            Why Siren
          </Link>
          <Link
            href="/demo"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-surface-alt hover:text-ink"
          >
            Try demo
          </Link>
          <MarketingAuthCTAs variant="header" />
        </nav>
      </div>
    </header>
  );
}
