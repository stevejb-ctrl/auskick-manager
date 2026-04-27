import { PulseMark } from "@/components/brand/PulseMark";

interface SirenWordmarkProps {
  className?: string;
  /** Controls type scale + pulse-mark size. */
  size?: "sm" | "md" | "lg";
  /** Fires the halo animation around the mark (hero use). */
  pulsing?: boolean;
}

const SCALE: Record<Required<SirenWordmarkProps>["size"], { mark: number; text: string; gap: string }> = {
  sm: { mark: 20, text: "text-lg", gap: "gap-1.5" },
  md: { mark: 28, text: "text-2xl", gap: "gap-2" },
  lg: { mark: 40, text: "text-4xl", gap: "gap-3" },
};

/**
 * Horizontal lockup: "Siren" wordmark + pulse mark. The mark paints in
 * `alarm` — the warm ember of a footy siren — which is the brand hue.
 * The wordmark itself stays ink-black so the orange reads as the
 * identity, not the name.
 */
export function SirenWordmark({
  className = "",
  size = "md",
  pulsing = false,
}: SirenWordmarkProps) {
  const s = SCALE[size];
  return (
    <span
      className={`inline-flex items-start ${s.gap} ${className}`}
      aria-label="Siren"
      role="img"
    >
      {/* Geist 900 + -0.05em letter-spacing matches the brand SVG exactly.
          --font-geist-sans is loaded in the root layout via the geist package
          so this renders in true Geist Black, not the app-wide Inter. */}
      <span
        className={`leading-none ${s.text} text-ink`}
        style={{
          fontFamily: 'var(--font-geist-sans, "Helvetica Neue", Arial, sans-serif)',
          fontWeight: 900,
          letterSpacing: "-0.05em",
        }}
        aria-hidden="true"
      >
        Siren
      </span>
      {/* A 1px upward nudge places the mark centre exactly at the
          cap-height midpoint. The outer span has no font-size so
          the brand's "0.32em" would resolve against the body (16px)
          and land below the baseline — wrong. Leading-none geometry
          means items-start already does most of the work; -1px
          finishes it across all three scale sizes. */}
      <span className="text-alarm" style={{ marginTop: "-1px" }}>
        <PulseMark size={s.mark} pulsing={pulsing} />
      </span>
    </span>
  );
}
