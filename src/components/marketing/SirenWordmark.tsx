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
      className={`inline-flex items-center ${s.gap} ${className}`}
      aria-label="Siren"
      role="img"
    >
      <span
        className={`font-bold tracking-tightest leading-none ${s.text} text-ink`}
        aria-hidden="true"
      >
        Siren
      </span>
      <span className="text-alarm">
        <PulseMark size={s.mark} pulsing={pulsing} />
      </span>
    </span>
  );
}
