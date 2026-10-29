import Link from "next/link";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";
import { MARKETING_SPORTS, sportPagePath } from "@/lib/sports/marketing-sports";

const SIREN_LINKS = [
  { href: "/why-siren", label: "Why Siren" },
  { href: "/demo", label: "Demo" },
  { href: "/help", label: "Help" },
  { href: "/contact", label: "Contact" },
  { href: "/support", label: "Support" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

const heading = "font-mono text-micro font-bold uppercase tracking-[0.16em] text-ink-dim";
const link = "text-ink transition-colors duration-fast ease-out-quart hover:text-brand-700";

export function MarketingFooter() {
  const year = new Date().getFullYear();
  const brand = getBrand();
  const copy = getBrandCopy(brand.id);
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-x-12 gap-y-10 px-4 py-12 sm:px-6">
        {/* Brand + tagline + copyright */}
        <div className="flex min-w-0 flex-[1_1_15rem] flex-col gap-2">
          <SirenWordmark size="sm" />
          <span className="text-sm text-ink-dim">{copy.tagline} Built in Australia.</span>
          <span className="mt-4 font-mono text-micro tracking-[0.08em] text-ink-dim">
            © {year} {copy.productName}
          </span>
        </div>

        {/* Every sport's page, in popularity order: five down, then five. */}
        <nav aria-label="Sports" className="min-w-0 flex-[2_1_20rem]">
          <p className={heading}>Sports</p>
          <ul className="mt-3.5 grid grid-flow-col grid-cols-2 grid-rows-5 gap-x-6 gap-y-2.5 text-[0.9375rem]">
            {MARKETING_SPORTS.map((sport) => (
              <li key={sport.id}>
                <Link href={sportPagePath(sport)} className={link}>
                  {sport.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Siren" className="min-w-0 flex-[1_1_10rem]">
          <p className={heading}>Siren</p>
          <ul className="mt-3.5 flex flex-col gap-2.5 text-[0.9375rem]">
            {SIREN_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={link}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
