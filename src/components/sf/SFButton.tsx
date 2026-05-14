import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { PulseDot } from "@/components/ui/PulseDot";

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
  /**
   * When true, replaces the leading `icon` slot with the brand
   * PulseDot and disables the button. Call sites typically pair
   * this with a text swap ("Starting…" instead of "Ready for Q1")
   * so the button reads as busy in both modalities.
   */
  loading?: boolean;
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

// hover: handles pointer-on for desktop / iPad-trackpad.
// active: handles pointer-down for touch — Stagehand testers on
// phones described several tap-to-act buttons as "felt
// unresponsive" because the only visual feedback was the route
// landing 50-150ms later. Adding `active:` gives instant tap-down
// acknowledgement at the colour-swap level (no transform — scaling
// buttons reads toy-ish per Linear/Stripe convention). Each
// variant darkens past its hover state so the chord
// rest → hover → active reads as a deepening.
const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-ink text-warm border border-ink shadow-card hover:bg-ink/90 active:bg-ink/95",
  accent:
    "bg-brand-600 text-warm border border-brand-600 shadow-card hover:bg-brand-700 active:bg-brand-800",
  alarm:
    "bg-alarm text-white border border-alarm shadow-card hover:bg-alarm/90 active:bg-alarm/85",
  ghost:
    "bg-transparent text-ink border border-hairline hover:bg-surface-alt active:bg-hairline",
  subtle:
    "bg-surface-alt text-ink border border-transparent hover:bg-hairline active:bg-hairline",
  danger:
    "bg-transparent text-danger border border-hairline hover:bg-danger/5 active:bg-danger/10",
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
    loading = false,
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

  // When loading, the brand pulse takes the leading icon slot. Sized
  // to the button: sm/md → sm pulse; lg → md pulse. The icon prop is
  // ignored while loading — the pulse is the signal.
  const pulseSize: "sm" | "md" = size === "lg" ? "md" : "sm";
  const leadingNode = loading ? <PulseDot size={pulseSize} /> : icon;

  const inner = (
    <>
      {leadingNode}
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
    loading: _l,
    children: _c,
    className: _cn,
    href: _h,
    disabled,
    ...buttonRest
  } = props as AsButton & { href?: undefined };
  void _v; void _s; void _f; void _i; void _ia; void _l; void _c; void _cn; void _h;

  // Loading implicitly disables — saves every call site from
  // remembering to OR loading into disabled.
  const isDisabled = disabled || loading;

  return (
    <button
      {...buttonRest}
      disabled={isDisabled}
      className={`${classes} ${isDisabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      {inner}
    </button>
  );
}
