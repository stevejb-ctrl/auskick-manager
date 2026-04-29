interface GuernseyProps {
  /** Player jersey number. */
  num: number | string;
  /** Outer SVG size in px. Default 36. */
  size?: number;
  /** T-shirt fill colour. CSS string. Default ink. */
  color?: string;
  /** Number ink colour. CSS string. Default warm. */
  ink?: string;
  className?: string;
}

/**
 * T-shirt SVG with a player number printed on it. Used in the Bench
 * grid, the on-field tile sub-line, and the goal-kickers leaderboard.
 *
 * Defaults to ink-on-warm so it reads as the team's home strip; pass
 * `color` to tint per zone (forward / centre / back) on the list-viz
 * lineup screen.
 */
export function Guernsey({
  num,
  size = 36,
  color = "#1A1E1A", // ink
  ink = "#F7F5F1", // warm
  className = "",
}: GuernseyProps) {
  // 2-digit numbers (10–99) need a slightly smaller font to stay inside
  // the shirt body. Single digits get a chunkier scale so the badge
  // reads at a glance from a metre away on the boundary.
  const numStr = String(num);
  const fontSize = numStr.length >= 2 ? 14 : 17;

  // Stable id per render so multiple guernseys on the same page don't
  // share a clip path. Strips non-alphanum so non-numeric `num`
  // values still produce a valid id.
  const clipId = `guernsey-clip-${numStr.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M9 9 L14 5 Q20 8 26 5 L31 9 L34 14 L29 17 L29 33 Q20 35 11 33 L11 17 L6 14 Z" />
        </clipPath>
      </defs>
      <path
        d="M9 9 L14 5 Q20 8 26 5 L31 9 L34 14 L29 17 L29 33 Q20 35 11 33 L11 17 L6 14 Z"
        fill={color}
        stroke="rgba(0,0,0,0.15)"
        strokeWidth="0.5"
      />
      <text
        x="20"
        y="26"
        textAnchor="middle"
        fontFamily="var(--font-geist-mono), ui-monospace, monospace"
        fontSize={fontSize}
        fontWeight="800"
        fill={ink}
        clipPath={`url(#${clipId})`}
      >
        {numStr}
      </text>
    </svg>
  );
}
