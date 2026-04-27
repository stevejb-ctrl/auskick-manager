import type { CSSProperties } from "react";

interface SirenWordmarkProps {
  className?: string;
  /** Controls type scale + pulse-mark size. */
  size?: "sm" | "md" | "lg";
  /** Fires the halo animation around the mark (hero use). */
  pulsing?: boolean;
}

/**
 * Per-scale geometry. Proportions match the brand spec at 128px:
 *   dot diameter ≈ 0.19em, gap ≈ 0.03em, pulse max ≈ 0.23em.
 */
const SCALE: Record<
  Required<SirenWordmarkProps>["size"],
  { fontSize: number; dot: number; pulseR: number; gap: number }
> = {
  sm: { fontSize: 18, dot: 5, pulseR: 5, gap: 2 },
  md: { fontSize: 24, dot: 6, pulseR: 7, gap: 3 },
  lg: { fontSize: 36, dot: 9, pulseR: 10, gap: 4 },
};

/**
 * Horizontal lockup: "Siren" wordmark + brand pulse mark.
 *
 * Faithful port of the brand's `siren-logo-animated.html`:
 *
 *   - Geist 900 / -0.05em letter-spacing on a font-size-bearing
 *     outer container so children resolve `em` units against the
 *     wordmark size (not the 16px body).
 *   - line-height: 0.9 on the lockup creates strongly negative
 *     half-leading. With `align-items: flex-start`, the line-box
 *     top sits below the visual text top — and the dot's
 *     `margin-top: 0.32em` then lands the mark centre ~2/3 of the
 *     way up the 'n', exactly as the design file shows.
 *   - SINGLE halo: a box-shadow ripple animated in globals.css.
 *     (PulseMark — used elsewhere for the Hero badge — has a
 *     static glow + ripple; that dual-halo treatment is wrong
 *     for the wordmark.)
 */
export function SirenWordmark({
  className = "",
  size = "md",
  pulsing = false,
}: SirenWordmarkProps) {
  const s = SCALE[size];

  // Custom property consumed by the .siren-dot--pulsing keyframe.
  // Inline-style + custom-property typing in React requires the cast.
  const dotStyle: CSSProperties = {
    display: "inline-block",
    width: s.dot,
    height: s.dot,
    borderRadius: "50%",
    background: "#D9442D",
    marginTop: "0.32em",
    flexShrink: 0,
    ["--siren-pulse-r" as string]: `${s.pulseR}px`,
  } as CSSProperties;

  return (
    <span
      className={`inline-flex items-start ${className}`}
      style={{
        fontFamily:
          'var(--font-geist-sans, "Helvetica Neue", Arial, sans-serif)',
        fontWeight: 900,
        fontSize: s.fontSize,
        lineHeight: 0.9,
        letterSpacing: "-0.05em",
        color: "#141613",
        gap: s.gap,
      }}
      aria-label="Siren"
      role="img"
    >
      <span aria-hidden="true">Siren</span>
      <span
        aria-hidden="true"
        className={pulsing ? "siren-dot--pulsing" : undefined}
        style={dotStyle}
      />
    </span>
  );
}
