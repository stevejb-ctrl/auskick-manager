export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Team name */}
      <div className="rounded-lg border border-hairline bg-surface p-4 space-y-3">
        <div className="h-4 w-24 animate-pulse rounded bg-surface-alt" />
        <div className="h-10 animate-pulse rounded-lg bg-surface-alt" />
      </div>
      {/* Members */}
      <div className="rounded-lg border border-hairline bg-surface p-4 space-y-3">
        <div className="h-4 w-20 animate-pulse rounded bg-surface-alt" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between py-2">
            <div className="h-4 w-36 animate-pulse rounded bg-surface-alt" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-surface-alt" />
          </div>
        ))}
      </div>
      {/* Scoring toggle */}
      <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface p-4">
        <div className="space-y-1.5">
          <div className="h-4 w-28 animate-pulse rounded bg-surface-alt" />
          <div className="h-3 w-44 animate-pulse rounded bg-surface-alt" />
        </div>
        <div className="h-6 w-11 animate-pulse rounded-full bg-surface-alt" />
      </div>
      {/* Song */}
      <div className="rounded-lg border border-hairline bg-surface p-4 space-y-3">
        <div className="h-4 w-24 animate-pulse rounded bg-surface-alt" />
        <div className="h-10 animate-pulse rounded-lg bg-surface-alt" />
      </div>
    </div>
  );
}
