import Link from "next/link";
import { PulseMark } from "@/components/brand/PulseMark";

// Site-wide promo strip. Sits above the sticky header so the offer
// travels with the visitor through the whole marketing surface.
// Keep copy short — phone screens are narrow.
export function MarketingBanner() {
  return (
    <div className="bg-ink text-warm">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center text-[12px] font-medium sm:px-6 sm:text-sm">
        <span className="text-warn">
          <PulseMark size={14} pulsing />
        </span>
        <span>
          <span className="font-bold text-warn">Free</span> for the entire
          2026 season.
        </span>
        <span className="hidden text-warm/60 sm:inline">·</span>
        <Link
          href="/signup"
          className="hidden underline-offset-2 transition-colors duration-fast ease-out-quart hover:text-warn hover:underline sm:inline"
        >
          Sign up in under a minute
        </Link>
      </div>
    </div>
  );
}
