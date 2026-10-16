import type { ReactNode } from "react";

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** A next step, e.g. a button or link. */
  action?: ReactNode;
  /** "page" for a whole empty screen; "section" (default) for a list or card. */
  size?: "section" | "page" | "compact";
}

const PAD: Record<NonNullable<EmptyStateProps["size"]>, string> = {
  compact: "px-3 py-4",
  section: "px-4 py-6",
  page: "px-6 py-16",
};

/**
 * One empty state for every list, card and screen (UX plan Phase 6):
 * a dashed box, what's missing, and what to do about it.
 */
export function EmptyState({ title, description, action, size = "section" }: EmptyStateProps) {
  return (
    <div className={`rounded-lg border border-dashed border-hairline bg-surface-alt text-center ${PAD[size]}`}>
      <p className="text-sm font-medium text-ink-dim">{title}</p>
      {description && <p className="mt-1 text-xs text-ink-mute">{description}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}
