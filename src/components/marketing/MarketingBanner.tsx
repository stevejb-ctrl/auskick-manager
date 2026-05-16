import Link from "next/link";

// Site-wide promo strip. Sits above the sticky header so the offer
// travels with the visitor through the whole marketing surface.
// Mono caps with banner-tracking per the Field Sunday design spec —
// the typographic treatment carries the brand register more than any
// chrome would.
export function MarketingBanner() {
  return (
    <div className="bg-ink text-warm">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-4 py-2 text-center font-mono text-[11px] uppercase tracking-banner sm:px-6">
        <span className="text-warm">
          Free for the entire 2026 season.
        </span>
        <span className="hidden text-warm/40 sm:inline">·</span>
        <Link
          href="/signup"
          className="hidden text-accent underline decoration-warm/40 decoration-1 underline-offset-4 transition-colors duration-fast ease-out-quart hover:text-warm sm:inline"
        >
          Sign up in under a minute →
        </Link>
      </div>
    </div>
  );
}
