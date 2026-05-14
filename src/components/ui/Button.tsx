import { ButtonHTMLAttributes, forwardRef } from "react";
import { PulseDot } from "@/components/ui/PulseDot";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

// `active:` mirrors SFButton's pattern — pointer-down darkens past
// the hover step so the rest → hover → active chord reads as a
// deepening. Phones can't hover; without `active:` the tap is
// silent for the 50-150ms before the action lands.
const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-warm hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand-600 disabled:bg-brand-300",
  secondary:
    "bg-surface text-ink border border-hairline hover:bg-surface-alt active:bg-hairline focus-visible:ring-brand-600 disabled:opacity-50",
  ghost:
    "text-ink-dim hover:bg-surface-alt hover:text-ink active:bg-ink/10 focus-visible:ring-brand-600 disabled:opacity-50",
  danger:
    "bg-danger text-warm hover:bg-danger/90 active:bg-danger/80 focus-visible:ring-danger disabled:opacity-60",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", size = "md", loading, disabled, children, className = "", ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "inline-flex items-center justify-center gap-2 rounded-md font-medium",
          "transition-colors duration-fast ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(" ")}
        {...props}
      >
        {loading && <PulseDot size="sm" label="Working" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
