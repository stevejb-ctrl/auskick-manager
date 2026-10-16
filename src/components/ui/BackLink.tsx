import Link from "next/link";
import { SFIcon } from "@/components/sf";

/**
 * The one back affordance (UX plan Phase 6): a chevron and where it goes,
 * top-left of the page, 44 pt tall. Full-screen game modes use
 * LiveTopBar's exit instead.
 */
export function BackLink({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      data-testid="back-link"
      className={`-ml-1 inline-flex min-h-[44px] items-center gap-1 px-1 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink motion-safe:active:scale-[0.97] ${className}`}
    >
      <SFIcon.chevronLeft />
      {label}
    </Link>
  );
}
