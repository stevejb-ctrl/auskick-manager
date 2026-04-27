import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "accent" | "alarm" | "ghost" | "subtle" | "danger";
type Size = "sm" | "md" | "lg";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  /** Stretches to container width — used in stacked phone layouts. */
  full?: boolean;
  /** Leading icon. Pass an SVG or SFIcon node. */
  icon?: ReactNode;
  /** Trailing icon — chevrons go here. */
  iconAfter?: ReactNode;
  children: ReactNode;
  className?: string;
}

type ButtonOnly = Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps | "size">;

interface AsButton extends CommonProps, ButtonOnly {
  href?: undefined;
}

interface AsLink extends CommonProps {
  /** When provided, renders as a Next.js Link (no nested anchor/button). */
  href: string;
  /** Optional aria-label override. */
  "aria-label"?: string;
  /** Native target/rel passed to the underlying anchor. */
  target?: string;
  rel?: string;
}

type SFButtonProps = AsButton | AsLink;

const SIZE_CLASSES: Record<Size, string> = {
  // Touch target ≥44 px on md per the design accessibility spec.
  sm: "h-[34px] px-3.5 text-[13px] gap-1.5",
  md: "h-11 px-[18px] text-sm gap-2",
  lg: "h-[52px] px-[22px] text-[15px] gap-2.5",
};

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-ink text-warm border border-ink shadow-card hover:bg-ink/90",
  accent:
    "bg-brand-600 text-warm border border-brand-600 shadow-card hover:bg-brand-700",
  alarm: "bg-alarm text-white border border-alarm shadow-card hover:bg-alarm/90",
  ghost: "bg-transparent text-ink border border-hairline hover:bg-surface-alt",
  subtle: "bg-surface-alt text-ink border border-transparent hover:bg-hairline",
  danger: "bg-transparent text-danger border border-hairline hover:bg-danger/5",
};

const BASE =
  "inline-flex items-center justify-center rounded-md font-semibold transition-colors duration-fast ease-out-quart";

/**
 * Pill button for SF surfaces. Six variants × three sizes.
 *
 * Polymorphic: pass `href` to render as a Next.js Link instead of a
 * `<button>` — keeps the DOM clean (no nested `<a><button>`).
 *
 * The legacy `Button` (`src/components/ui/Button.tsx`) stays available;
 * this is a sibling, not a replacement.
 */
export function SFButton(props: SFButtonProps) {
  const {
    variant = "primary",
    size = "md",
    full = false,
    icon,
    iconAfter,
    children,
    className = "",
  } = props;

  const classes = [
    BASE,
    SIZE_CLASSES[size],
    VARIANT_CLASSES[variant],
    full ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      {icon}
      {children}
      {iconAfter}
    </>
  );

  if (props.href !== undefined) {
    const { href, target, rel, "aria-label": ariaLabel } = props;
    return (
      <Link href={href} className={classes} target={target} rel={rel} aria-label={ariaLabel}>
        {inner}
      </Link>
    );
  }

  // Strip our display props so they don't leak onto the DOM as
  // unknown attributes (React would otherwise warn).
  const {
    variant: _v,
    size: _s,
    full: _f,
    icon: _i,
    iconAfter: _ia,
    children: _c,
    className: _cn,
    href: _h,
    disabled,
    ...buttonRest
  } = props as AsButton & { href?: undefined };
  void _v; void _s; void _f; void _i; void _ia; void _c; void _cn; void _h;

  return (
    <button
      {...buttonRest}
      disabled={disabled}
      className={`${classes} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      {inner}
    </button>
  );
}
