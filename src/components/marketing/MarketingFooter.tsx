import Link from "next/link";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";

// Site footer aligned with the marketing handoff: three loose columns
// on desktop (brand + tagline / link row / "Built in Australia"),
// stacked on phones. Hairline top, warm bg.
export function MarketingFooter() {
  const year = new Date().getFullYear();
  const brand = getBrand();
  const copy = getBrandCopy(brand.id);
  return (
    <footer className="border-t border-hairline bg-warm">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between md:gap-6">
        {/* Brand + tagline + copyright */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <SirenWordmark size="sm" />
            <span className="text-xs text-ink-dim sm:text-sm">{copy.tagline}</span>
          </div>
          <span className="font-mono text-[11px] tracking-[0.08em] text-ink-mute">
            © {year} {copy.productName}
          </span>
        </div>

        {/* Centred link row */}
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-dim">
          {[
            { href: "/why-siren", label: "Why Siren" },
            { href: "/#features", label: "Features" },
            { href: "/demo", label: "Demo" },
            { href: "/help", label: "Help" },
            { href: "/contact", label: "Contact" },
            { href: "/privacy", label: "Privacy" },
            { href: "/terms", label: "Terms" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition-colors duration-fast ease-out-quart hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Locale tag, desktop only — keeps phone footer compact */}
        <span className="hidden font-mono text-[11px] uppercase tracking-[0.16em] text-ink-mute md:inline">
          Built in Australia
        </span>
      </div>
    </footer>
  );
}
