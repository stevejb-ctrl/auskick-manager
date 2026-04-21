interface TagChipProps {
  name: string;
  color: string;
  onRemove?: () => void;
  className?: string;
}

// Tailwind class tokens for each supported tag colour. Kept small on purpose —
// the admin picks from a fixed palette, not arbitrary hex.
const colorClasses: Record<string, string> = {
  brand: "bg-brand-100 text-brand-700",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok/10 text-ok",
  info: "bg-info/10 text-info",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-surface-alt text-ink-dim",
};

export function TagChip({ name, color, onRemove, className = "" }: TagChipProps) {
  const tone = colorClasses[color] ?? colorClasses.brand;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone} ${className}`}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-1 rounded-full px-1 text-[10px] leading-none opacity-70 hover:opacity-100"
          aria-label={`Remove tag ${name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

export const TAG_COLORS = ["brand", "warn", "ok", "info", "danger", "neutral"] as const;
