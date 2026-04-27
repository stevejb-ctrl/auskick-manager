import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "accent" | "alarm" | "ghost" | "subtle" | "danger";
type Size = "sm" | "md" | "lg";

interface SFButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  variant?: Variant;
  size?: Size;
  /** Stretches to container width — used in stacked phone layouts. */
  full?: boolean;
  /** Leading icon. Pass an SVG or SFIcon node. */
  icon?: ReactNode;
  /** Trailing icon — chevrons go here. */
  iconAfter?: ReactNode;
  children: ReactNode;
}

const SIZE_CLASSES: Record<Size, string> = {
  // Touch target ≥44 px on md per the design accessibility spec.
  sm: "h-[34px] px-3.5 text-[13px] gap-1.5",
  md: "h-11 px-[18px] text-sm gap-2",
  lg: "h-[52px] px-[22px] text-[15px] gap-2.5",
};

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-ink text-warm border border-ink shadow-card hover:bg-ink/90",
  accent:
    "bg-brand-600 text-warm border border-brand-600 shadow-card hover:bg-brand-700",
  alarm:
    "bg-alarm text-white border border-alarm shadow-card hover:bg-alarm/90",
  ghost:
    "bg-transparent text-ink border border-hairline hover:bg-surface-alt",
  subtle:
    "bg-surface-alt text-ink border border-transparent hover:bg-hairline",
  danger:
    "bg-transparent text-danger border border-hairline hover:bg-danger/5",
};

/**
 * Pill button for SF surfaces. Six variants × three sizes.
 *
 * The legacy `Button` component (`src/components/ui/Button.tsx`) stays
 * available — this is a sibling, not a replacement, so existing pages
 * can migrate one-by-one without churn.
 */
export function SFButton({
  variant = "primary",
  size = "md",
  full = false,
  icon,
  iconAfter,
  children,
  className = "",
  disabled,
  ...rest
}: SFButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center rounded-md font-semibold
        transition-colors duration-fast ease-out-quart
        ${SIZE_CLASSES[size]}
        ${VARIANT_CLASSES[variant]}
        ${full ? "w-full" : ""}
        ${disabled ? "cursor-not-allowed opacity-50" : ""}
        ${className}
      `}
    >
      {icon}
      {children}
      {iconAfter}
    </button>
  );
}
