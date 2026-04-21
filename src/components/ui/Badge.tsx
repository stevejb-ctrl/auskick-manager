type Variant = "active" | "inactive" | "admin" | "game_manager" | "parent";

interface BadgeProps {
  variant: Variant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  active: "bg-ok/10 text-ok",
  inactive: "bg-surface-alt text-ink-mute",
  admin: "bg-ink text-warm",
  game_manager: "bg-brand-100 text-brand-700",
  parent: "bg-surface-alt text-ink-dim",
};

export function Badge({ variant, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
