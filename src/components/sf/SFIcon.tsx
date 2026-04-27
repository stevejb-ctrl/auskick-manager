import type { SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  /** Stroke colour. Defaults to currentColor so the icon picks up text-* classes. */
  color?: string;
  /** Square size in px. Defaults to 16. */
  size?: number;
}

/**
 * Line-style icon set per the design spec — 16 px default, stroke 2,
 * round caps and joins. All icons inherit colour from `currentColor`
 * so they tint via Tailwind text-* classes.
 *
 * Naming matches `prototype/sf/ui.jsx` exactly. Add to this map as
 * the design needs more glyphs.
 */

function Base({
  color = "currentColor",
  size = 16,
  children,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SFIcon = {
  chevronRight: (props: IconProps = {}) => (
    <Base {...props}>
      <polyline points="9 18 15 12 9 6" />
    </Base>
  ),
  chevronLeft: (props: IconProps = {}) => (
    <Base {...props}>
      <polyline points="15 18 9 12 15 6" />
    </Base>
  ),
  swap: (props: IconProps = {}) => (
    <Base {...props}>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </Base>
  ),
  share: (props: IconProps = {}) => (
    <Base {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </Base>
  ),
  more: (props: IconProps = {}) => (
    <Base size={20} {...props}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </Base>
  ),
  whistle: (props: IconProps = {}) => (
    <Base size={18} {...props}>
      <path d="M3 12a6 6 0 0 0 12 0" />
      <path d="M15 8h6l-3 4 3 4h-6" />
      <circle cx="9" cy="12" r="2" />
    </Base>
  ),
  trophy: (props: IconProps = {}) => (
    <Base size={18} {...props}>
      <path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z" />
      <path d="M21 4h-4v3a3 3 0 0 0 4 0V4zM3 4h4v3a3 3 0 0 1-4 0V4z" />
    </Base>
  ),
  pin: (props: IconProps = {}) => (
    <Base size={14} {...props}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </Base>
  ),
};
