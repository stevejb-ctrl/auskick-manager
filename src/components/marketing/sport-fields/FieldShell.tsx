import { type ReactNode } from "react";

interface FieldShellProps {
  /** Hex accent — currently unused at the SVG layer (the picker
   *  card draws its own background) but kept on the prop for parity
   *  with the per-sport field components that still accept it from
   *  their callers. */
  accent: string;
  /** Tint opacity (0..1) for an optional accent overlay rect. Pass
   *  > 0 to paint a tinted layer inside the SVG; leave at 0 to make
   *  the SVG transparent and let the parent's background show
   *  through (the standard picker-card use). */
  tintOpacity?: number;
  /** SVG viewBox aspect — defaults to AFL/League/Netball common 200x220. */
  viewBox?: string;
  /** preserveAspectRatio — defaults to anchoring bottom-middle
   *  (`xMidYMax meet`) so when the SVG is placed in a container that
   *  's wider or shorter than the SVG aspect, the field markings
   *  keep their lower half pinned to the bottom of the container and
   *  any letterboxing happens at the top. Pre-2026-05-26 the default
   *  was `xMidYMid meet` (centre-anchored) which didn't match this
   *  comment; updated to match the documented intent now that the
   *  picker cards rely on the bottom-anchored crop. */
  preserveAspectRatio?: string;
  /** Accessible label for the diagram. */
  ariaLabel: string;
  children: ReactNode;
}

/**
 * Shared frame for every sport's field illustration. Owns ONLY the
 * SVG wrapper + the cream field-stroke CSS variables. Background +
 * card-edge rounding live on the consumer (each picker card draws
 * its own accent / dark surface, so the SVG must be transparent).
 *
 * Per the multi-sport homepage handoff
 * (design_handoff_multi_sport_home/README.md):
 *
 *   - Field markings: cream `rgba(242,238,228,0.7)`, 1.8px solid
 *   - Hairlines (decorative): 0.8px at 0.45 opacity
 *   - Dashed lines: `stroke-dasharray="6 6"`
 *
 * The actual markings live inside `children` — this shell only owns
 * the SVG wrapper + stroke variables. That keeps each sport's SVG
 * focused on its specific markings (zone lines, posts, hoops)
 * without repeating the stroke setup three times.
 */
export function FieldShell({
  accent,
  tintOpacity = 0,
  viewBox = "0 0 200 220",
  preserveAspectRatio = "xMidYMax meet",
  ariaLabel,
  children,
}: FieldShellProps) {
  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio={preserveAspectRatio}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
      // Stroke variables flow down to children via CSS custom
      // properties on the root SVG element so each marking can just
      // reference `var(--field-stroke)` etc.
      style={
        {
          "--field-stroke": "rgba(242,238,228,0.7)",
          "--field-stroke-faint": "rgba(242,238,228,0.45)",
          "--field-fill-soft": "rgba(242,238,228,0.06)",
        } as React.CSSProperties
      }
      className="block h-full w-full"
    >
      {/* Optional accent-tinted overlay — most callers pass
          tintOpacity=0 (transparent SVG, card background shows
          through). The standalone-card use case from an earlier
          design version used 0.12 here to paint a tinted plate
          inside the SVG; kept for parity but not currently
          consumed. */}
      {tintOpacity > 0 && (
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill={accent}
          opacity={tintOpacity}
        />
      )}
      {children}
    </svg>
  );
}
