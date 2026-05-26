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
  /** preserveAspectRatio — defaults to `xMinYMin meet` so the
   *  field's TOP-LEFT corner anchors to the container's top-left
   *  and the content fits inside (no internal cropping). Picker
   *  cards pair this with a container that's bigger than the card
   *  and positioned with positive top/left offsets so the field's
   *  BOTTOM-RIGHT extends past the card edges — the card's own
   *  `overflow-hidden` then crops the field's bottom-right corner
   *  (matches Claude Design v4's "field overflows bottom-right of
   *  card" pattern). The visible portion is the field's top-left
   *  region, positioned in the card's bottom-right quadrant. */
  preserveAspectRatio?: string;
  /**
   * Which surface the field is being rendered on.
   *   - "on-dark" (default): cream strokes — picker cards have a
   *     dark accent fill, cream reads well against it.
   *   - "on-light": dark ink strokes — for use on light/cream
   *     backgrounds (the hero section). Cream-on-cream is invisible.
   */
  strokeTheme?: "on-dark" | "on-light";
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
  preserveAspectRatio = "xMinYMin meet",
  strokeTheme = "on-dark",
  ariaLabel,
  children,
}: FieldShellProps) {
  // Stroke palette per surface. Cream for dark backgrounds (picker
  // cards), dark ink for light backgrounds (hero watermark). Each
  // marking element inside `children` references the CSS variable
  // names, so swapping the values here re-themes the entire field
  // with no per-marking changes.
  //
  // on-light colours are near-solid (rgba 0.85 / 0.55) so the
  // strokes read crisply — the THINNESS is controlled separately
  // by the .field-on-light CSS rule in globals.css, which also
  // re-targets the inline strokeWidth attributes down to
  // FieldOval-equivalent hairlines (0.7 / 0.45). Combined effect
  // matches FieldOval's crisp-hairline aesthetic. Final
  // visibility is then tuned by the wrapper div's opacity.
  const strokeVars: React.CSSProperties =
    strokeTheme === "on-light"
      ? ({
          "--field-stroke": "rgba(15,18,17,0.85)",
          "--field-stroke-faint": "rgba(15,18,17,0.55)",
          "--field-fill-soft": "rgba(15,18,17,0.04)",
        } as React.CSSProperties)
      : ({
          "--field-stroke": "rgba(242,238,228,0.7)",
          "--field-stroke-faint": "rgba(242,238,228,0.45)",
          "--field-fill-soft": "rgba(242,238,228,0.06)",
        } as React.CSSProperties);

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
      style={strokeVars}
      // .field-on-light is a globals.css rule that re-targets
      // child stroke widths down to FieldOval-equivalent hairlines
      // (0.7 / 0.45) when the hero uses the watermark. Picker
      // cards (default on-dark) keep the authored thicker widths.
      className={`block h-full w-full ${
        strokeTheme === "on-light" ? "field-on-light" : ""
      }`}
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
