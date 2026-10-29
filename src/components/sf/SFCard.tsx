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
  /** DOM id — lets a page link straight to a card ("#summary"). */
  id?: string;
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
  id,
}: SFCardProps) {
  const interactiveClasses = interactive || onClick
    ? "cursor-pointer transition-all duration-base ease-out-quart hover:-translate-y-px hover:shadow-pop"
    : "";

  return (
    <div
      id={id}
      onClick={onClick}
      className={`rounded-lg border border-hairline bg-surface shadow-card ${interactiveClasses} ${className}`}
      // pad={0} leaves padding to the className: an inline 0 overrode the
      // px-4 / py-3 that the Games rows asked for, so their text sat on
      // the card's edge (design review, Oct 2026).
      style={pad === 0 ? style : { padding: pad, ...style }}
    >
      {children}
    </div>
  );
}
