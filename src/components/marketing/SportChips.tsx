import Link from "next/link";
import {
  MARKETING_SPORTS,
  type MarketingSportId,
  sportPagePath,
} from "@/lib/sports/marketing-sports";

interface SportChipsProps {
  /** The words before the chips, and the nav's name: "I coach". */
  label: string;
  /** Leave one sport out (a sport page's own). */
  except?: MarketingSportId;
  /** On the chalk page (ink chips with the sport's dot) or a field band (chalk). */
  on?: "page" | "band";
  className?: string;
}

/**
 * Every sport as a row of chip links to its page, in popularity order:
 * the homepage hero's "I coach" row and a sport page's "Coach another
 * sport too?" row. Real links in the server HTML, so crawlers see every
 * sport from the top of the page.
 */
export function SportChips({ label, except, on = "page", className = "" }: SportChipsProps) {
  const band = on === "band";
  return (
    <nav aria-label={label} className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className={`mr-2 font-display text-[1.0625rem] font-bold stretch-80 ${band ? "text-mark/85" : "text-ink-dim"}`}>
        {label}
      </span>
      {MARKETING_SPORTS.filter((s) => s.id !== except).map((sport) => (
        <Link
          key={sport.id}
          href={sportPagePath(sport)}
          data-testid={`sport-chip-${sport.id}`}
          className={
            band
              ? "inline-flex h-11 items-center rounded-full px-4 text-[0.9375rem] font-semibold text-mark shadow-[inset_0_0_0_1.5px_rgb(247_250_245_/_0.4)] transition-colors duration-fast ease-out-quart hover:bg-mark hover:text-mark-ink"
              : "inline-flex h-11 items-center gap-2 rounded-full border border-hairline bg-surface pl-3.5 pr-4 text-[0.9375rem] font-semibold text-ink transition-colors duration-fast ease-out-quart hover:border-ink"
          }
        >
          {!band && <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: sport.accent }} />}
          {sport.short}
        </Link>
      ))}
    </nav>
  );
}
