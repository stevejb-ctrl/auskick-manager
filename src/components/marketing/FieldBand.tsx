import type { CSSProperties, ReactNode } from "react";
import { SportFieldGlyph } from "@/components/marketing/SportFieldGlyph";
import type { MarketingSurface } from "@/lib/sports/marketing-sports";
import type { SportId } from "@/lib/sports/types";

// ─── FieldBand ───────────────────────────────────────────────
// A full-width band of a sport's playing surface, marked out in chalk:
// the site's hero, tour and sign-up sections (docs/marketing/
// V3-SITE-DESIGN.md). The surface colours are the live screen's own
// (FieldLines: bg-field / bg-court / bg-wood, the same in both themes),
// and the markings are the sport's ground as the tiles draw it
// (SportFieldGlyph), large and faint, cropped by the band: landscape
// from md up, end-on below it, as a phone looks down the live field.
//
// Words on a band are chalk (`text-mark`): 9.6:1 or better on all three
// surfaces. The keyboard ring turns chalk too (--focus-ring, read by the
// global :focus-visible rule in globals.css). It clips with overflow:
// clip, not hidden, so the tour's phone can still stick (GameTour).

/** Each surface's texture, a few per cent over its colour. */
const TEXTURE: Record<MarketingSurface, CSSProperties> = {
  // Mowing stripes, as an oval looks from the stand.
  field: {
    backgroundImage:
      "repeating-linear-gradient(90deg, rgb(247 250 245 / 0.035) 0 112px, transparent 112px 224px)",
  },
  // A lacquered court: a little light off the top.
  court: {
    backgroundImage: "linear-gradient(180deg, rgb(247 250 245 / 0.05), transparent 55%)",
  },
  // Boards, laid lengthwise.
  wood: {
    backgroundImage:
      "repeating-linear-gradient(0deg, rgb(0 0 0 / 0.12) 0 1px, transparent 1px 30px), repeating-linear-gradient(0deg, rgb(247 250 245 / 0.025) 0 30px, transparent 30px 60px)",
  },
};

const SURFACE_BG: Record<MarketingSurface, string> = {
  field: "bg-field",
  court: "bg-court",
  wood: "bg-wood",
};

interface FieldBandProps {
  surface: MarketingSurface;
  /** Whose ground to mark out; none for a plain surface. */
  marks?: SportId;
  /** Mark the lines in on load (the hero's one moment of motion). */
  drawIn?: boolean;
  /** How strong the chalk markings are, 0–1. */
  markOpacity?: number;
  id?: string;
  labelledBy?: string;
  label?: string;
  className?: string;
  children: ReactNode;
}

export function FieldBand({
  surface,
  marks,
  drawIn = false,
  markOpacity = 0.18,
  id,
  labelledBy,
  label,
  className = "",
  children,
}: FieldBandProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      aria-label={label}
      data-surface={surface}
      className={`field-band relative isolate overflow-clip text-mark ${SURFACE_BG[surface]} ${className}`}
      style={TEXTURE[surface]}
    >
      {marks && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 -z-10 text-mark ${drawIn ? "chalk-mark-in" : ""}`}
          style={{ opacity: markOpacity }}
        >
          <SportFieldGlyph
            sport={marks}
            weight={2}
            orientation="portrait"
            fit="slice"
            className="h-full w-full md:hidden"
          />
          <SportFieldGlyph
            sport={marks}
            weight={2}
            fit="slice"
            className="hidden h-full w-full md:block"
          />
        </div>
      )}
      {children}
    </section>
  );
}
