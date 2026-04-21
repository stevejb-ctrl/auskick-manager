interface PulseMarkProps {
  /** Outer diameter in px. Dot + halo scale from this. Default 32. */
  size?: number;
  /**
   * Dot + halo colour. Defaults to `currentColor` so the mark inherits
   * from its container — e.g. a `text-alarm` wrapper paints it
   * siren-orange, a `text-warn` wrapper paints it ochre.
   */
  color?: string;
  /**
   * When true, the halo animates — a soft radial ripple expanding out
   * from the dot. Used on the marketing hero and the sub-due indicator
   * in the game header. Honors `prefers-reduced-motion`.
   */
  pulsing?: boolean;
  /** Forwarded to the wrapping span for layout. */
  className?: string;
  /**
   * If set, rendered on the wrapping span so assistive tech reads it.
   * Omit for purely decorative placements (the wordmark handles the
   * accessible name).
   */
  title?: string;
}

/**
 * The Siren pulse mark — a solid centre dot wrapped in a soft halo.
 * Reads as the warm ember glow of a footy siren. Used:
 *
 *   • as the marketing wordmark glyph (halo pulses)
 *   • as the favicon / app icon (static)
 *   • as the live sub-due indicator in the game header (pulses)
 *
 * The halo is painted with `bg-current` so the entire mark inherits
 * colour from a single `text-*` wrapper one level up — keeping the
 * siren-orange brand moment narrow: only on the logo and the sub-due
 * modal.
 */
export function PulseMark({
  size = 32,
  color = "currentColor",
  pulsing = false,
  className = "",
  title,
}: PulseMarkProps) {
  // Dot is ~48% of the outer. Leaves room around it for the halo to
  // read as a soft glow rather than a dot with a ring.
  const dotDiameter = Math.round(size * 0.48);

  return (
    <span
      className={`relative inline-block align-middle ${className}`}
      style={{ width: size, height: size, color }}
      aria-label={title}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {/* Static soft halo — always visible so the logo reads as dot +
          glow even in places where motion is off (favicon, reduced-
          motion users, static app header). */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-current"
        style={{ opacity: 0.22 }}
      />

      {/* Expanding ripple — only when pulsing. Scales + fades via the
          `pulseHalo` keyframe defined in tailwind.config. */}
      {pulsing && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-current motion-safe:animate-pulse-halo motion-reduce:hidden"
        />
      )}

      {/* Solid centre dot */}
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
        style={{ width: dotDiameter, height: dotDiameter }}
      />
    </span>
  );
}
