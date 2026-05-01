import Link from "next/link";
import { PulseMark } from "@/components/brand/PulseMark";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";

// Site-wide promo strip. Sits above the sticky header so the offer
// travels with the visitor through the whole marketing surface.
// Two-message format from the design handoff: a short prefix (calm,
// sentence case) followed by an alarm-orange call-to-action link.
// Keep copy short — phone screens are narrow.
export function MarketingBanner() {
  const brand = getBrand();
  const { banner } = getBrandCopy(brand.id);
  return (
    <div className="bg-ink text-warm">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.08em] sm:px-6 sm:text-[12px]">
        <span className="text-alarm">
          <PulseMark size={12} pulsing />
        </span>
        <span className="text-warm/75">{banner.prefix}</span>
        <span className="hidden text-warm/40 sm:inline">·</span>
        <Link
          href="/login"
          className="hidden border-b border-alarm/40 pb-px text-alarm transition-colors duration-fast ease-out-quart hover:border-alarm hover:text-alarm sm:inline"
        >
          {banner.linkText}
        </Link>
      </div>
    </div>
  );
}
