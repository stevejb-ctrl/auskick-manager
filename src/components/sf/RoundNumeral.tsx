interface RoundNumeralProps {
  /** Round number. Padded to 2 digits. */
  n: number;
  /** Numeral font-size in px. Default 64 (Game-detail / Home hero size). */
  size?: number;
  /** Override the numeral colour. Defaults to ink — pass `text-alarm` etc via wrapper. */
  className?: string;
}

/**
 * Decorative round display: a small mono "R" eyebrow to the left of a
 * large Instrument-Serif italic number ("R 07"). Used on the Games
 * list and the upcoming-game heroes.
 *
 * Sized via the `size` prop in px so callers can scale it for phone
 * vs desktop without scaling sub-text uniformly.
 */
export function RoundNumeral({ n, size = 64, className = "" }: RoundNumeralProps) {
  return (
    <div
      className={`inline-flex items-baseline ${className}`}
      style={{ lineHeight: 0.85 }}
    >
      <span
        className="mr-0.5 self-start font-mono font-semibold uppercase tracking-micro text-ink-dim"
        style={{
          fontSize: Math.round(size * 0.18),
          marginTop: Math.round(size * 0.18),
          fontStyle: "normal",
        }}
      >
        R
      </span>
      <span
        className="font-serif italic"
        style={{
          fontSize: size,
          fontWeight: 400,
          letterSpacing: "-0.02em",
        }}
      >
        {String(n).padStart(2, "0")}
      </span>
    </div>
  );
}
