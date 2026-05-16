import type { CSSProperties } from "react";

interface SirenWordmarkProps {
  className?: string;
  /** Controls type scale + dot size. */
  size?: "sm" | "md" | "lg";
  /** Fires the single-ring pulse animation around the dot. */
  pulsing?: boolean;
}

// Pixel-precise sizing that mirrors the production siren mark
// (`prototype/sf/ui.jsx` SirenMark): the dot is ~22% of the text
// size, top-aligned, with a margin-top of ~18% to sit near the cap
// height of the wordmark — like the tip of an "i".
const SCALE: Record<Required<SirenWordmarkProps>["size"], {
  text: string;
  dotSize: number;
  dotMarginTop: number;
  pulseSpread: number;
}> = {
  sm: { text: "text-lg",  dotSize: 4, dotMarginTop: 3, pulseSpread: 9 },
  md: { text: "text-2xl", dotSize: 5, dotMarginTop: 4, pulseSpread: 14 },
  lg: { text: "text-4xl", dotSize: 8, dotMarginTop: 7, pulseSpread: 22 },
};

/**
 * Horizontal lockup: "Siren" wordmark + a single alarm-orange dot
 * sitting at the top-right corner. When `pulsing` is true the dot
 * emits a single expanding box-shadow ring — no static halo behind
 * it, per the production mark. Matches sirenfooty.com.au.
 */
export function SirenWordmark({
  className = "",
  size = "md",
  pulsing = false,
}: SirenWordmarkProps) {
  const s = SCALE[size];
  const dotStyle: CSSProperties = {
    width: s.dotSize,
    height: s.dotSize,
    marginTop: s.dotMarginTop,
    // Per-instance ring expansion target read by the
    // `sirenPulse` keyframe in tailwind.config.ts.
    ["--siren-pulse-spread" as string]: `${s.pulseSpread}px`,
  };

  return (
    <span
      className={`inline-flex items-start leading-none ${className}`}
      style={{ gap: 3 }}
      aria-label="Siren"
      role="img"
    >
      <span
        className={`font-bold tracking-tightest leading-none ${s.text} text-ink`}
        aria-hidden="true"
      >
        Siren
      </span>
      <span
        aria-hidden="true"
        className={`inline-block rounded-full bg-alarm ${
          pulsing ? "motion-safe:animate-siren-pulse" : ""
        }`}
        style={dotStyle}
      />
    </span>
  );
}
