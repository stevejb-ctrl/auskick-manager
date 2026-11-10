import type { ReactNode } from "react";
import { SportFieldGlyph } from "@/components/marketing/SportFieldGlyph";
import type { MarketingSportConfig, MarketingSurface } from "@/lib/sports/marketing-sports";

// ─── SportTile ───────────────────────────────────────────────
// One sport as a tile: a small piece of its ground (its surface, its
// markings in chalk), its colour dot, its name and one line. The
// homepage's sport directory links each tile to the sport's page; the
// demo picker makes each one a Run demo button. One face for both, so
// the two grids can't drift apart (CLAUDE.md: reuse before you fork).
// A row on a phone, a card from sm up.

const SURFACE_BG: Record<MarketingSurface, string> = {
  field: "bg-field",
  court: "bg-court",
  wood: "bg-wood",
};

/** The tile's frame: put it on the Link or button that wraps the face. */
export const SPORT_TILE_FRAME =
  "group flex h-full w-full flex-row items-center gap-4 rounded-[18px] border border-hairline bg-surface p-2.5 text-left transition-colors duration-fast ease-out-quart hover:border-ink sm:flex-col sm:items-stretch sm:gap-0 sm:overflow-hidden sm:p-0";

export function SportTileFace({
  sport,
  line,
  action,
  overlay,
}: {
  sport: Pick<MarketingSportConfig, "sport" | "short" | "accent" | "surface">;
  /** The words under the name. */
  line: ReactNode;
  /** A short action after the line ("Run demo"), or none. */
  action?: ReactNode;
  /** Laid over the ground, e.g. a loader while a demo starts. */
  overlay?: ReactNode;
}) {
  return (
    <>
      <span
        className={`relative flex aspect-[16/10] w-[88px] shrink-0 items-center rounded-[12px] p-1.5 text-mark/75 sm:w-auto sm:rounded-none sm:px-7 sm:py-5 ${SURFACE_BG[sport.surface]}`}
      >
        <SportFieldGlyph sport={sport.sport} weight={1.4} className="h-full w-full" />
        {overlay}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 sm:px-[18px] sm:pb-5 sm:pt-4">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: sport.accent }} />
          <span className="font-display text-[1.25rem] font-extrabold leading-tight text-ink stretch-80 sm:text-[1.375rem]">
            {sport.short}
          </span>
          <ArrowRight className="ml-auto hidden h-4 w-4 text-ink transition-transform duration-fast group-hover:translate-x-0.5 motion-reduce:transition-none sm:block" />
        </span>
        <span className="text-[0.875rem] leading-snug text-ink-dim sm:text-[0.9375rem]">{line}</span>
        {action && (
          <span className="font-display text-[0.9375rem] font-bold text-brand-700 stretch-80">{action}</span>
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-dim sm:hidden" />
    </>
  );
}

function ArrowRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={className}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={className}>
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}
