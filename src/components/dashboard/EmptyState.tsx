interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-surface-alt px-4 py-6 text-center">
      <p className="text-sm font-medium text-ink-dim">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-ink-mute">{description}</p>
      )}
    </div>
  );
}
