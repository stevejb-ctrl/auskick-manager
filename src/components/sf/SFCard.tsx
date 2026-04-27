import type { CSSProperties, MouseEventHandler, ReactNode } from "react";

interface SFCardProps {
  children: ReactNode;
  /** Inner padding in px. Defaults to 18 (cards on phone). 0 to opt out (custom inner padding). */
  pad?: number;
  /** Hover-lift treatment for clickable cards. Adds shadow-pop on hover. */
  interactive?: boolean;
  /** Click handler — if set, the card behaves like a button (cursor + interactive lift). */
  onClick?: MouseEventHandler<HTMLDivElement>;
  className?: string;
  style?: CSSProperties;
}

/**
 * Base card surface for SF screens. Replaces the project's ad-hoc
 * `rounded-lg border border-hairline bg-surface shadow-card` triplet
 * with a single component so future token tweaks land in one place.
 *
 * Use `pad={0}` when you need custom inner padding (e.g. heroes with
 * a tinted top region and a bordered footer row).
 */
export function SFCard({
  children,
  pad = 18,
  interactive = false,
  onClick,
  className = "",
  style,
}: SFCardProps) {
  const interactiveClasses = interactive || onClick
    ? "cursor-pointer transition-all duration-base ease-out-quart hover:-translate-y-px hover:shadow-pop"
    : "";

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border border-hairline bg-surface shadow-card ${interactiveClasses} ${className}`}
      style={{ padding: pad, ...style }}
    >
      {children}
    </div>
  );
}
