export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Game header */}
      <div className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded bg-surface-alt" />
        <div className="h-8 w-48 animate-pulse rounded-md bg-surface-alt" />
        <div className="h-4 w-32 animate-pulse rounded bg-surface-alt" />
      </div>
      {/* Action buttons */}
      <div className="flex gap-3">
        <div className="h-10 flex-1 animate-pulse rounded-lg bg-surface-alt" />
        <div className="h-10 flex-1 animate-pulse rounded-lg bg-surface-alt" />
      </div>
      {/* Availability list */}
      <div className="space-y-2">
        <div className="h-3 w-20 animate-pulse rounded bg-surface-alt" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-3"
          >
            <div className="h-4 w-32 animate-pulse rounded bg-surface-alt" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-surface-alt" />
          </div>
        ))}
      </div>
    </div>
  );
}
