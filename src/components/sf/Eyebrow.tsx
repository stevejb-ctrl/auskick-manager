import type { ReactNode } from "react";

interface EyebrowProps {
  children: ReactNode;
  /** Optional override colour. Defaults to ink-dim. */
  className?: string;
}

/**
 * Uppercase mono kicker label, e.g. "PLAYERS ON FIELD" / "ROUND 07 · HOME".
 *
 * The Field-Sunday voice uses these above section headings and on game
 * heroes. Always renders in `font-mono` with `tracking-micro` (0.16em),
 * weight 600.
 */
export function Eyebrow({ children, className = "" }: EyebrowProps) {
  return (
    <div
      className={`font-mono text-[11px] font-semibold uppercase tracking-micro text-ink-dim ${className}`}
    >
      {children}
    </div>
  );
}
