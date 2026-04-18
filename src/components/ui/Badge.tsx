type Variant = "active" | "inactive" | "admin" | "game_manager" | "parent";

interface BadgeProps {
  variant: Variant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-600",
  admin: "bg-purple-100 text-purple-800",
  game_manager: "bg-blue-100 text-blue-800",
  parent: "bg-gray-100 text-gray-600",
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
