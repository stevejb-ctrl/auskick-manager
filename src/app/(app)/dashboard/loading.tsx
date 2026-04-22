export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-36 animate-pulse rounded-md bg-surface-alt" />
        <div className="mt-1 h-4 w-56 animate-pulse rounded bg-surface-alt" />
      </div>
      <div className="divide-y divide-hairline rounded-lg border border-hairline bg-surface shadow-card">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="h-5 w-40 animate-pulse rounded bg-surface-alt" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-surface-alt" />
          </div>
        ))}
      </div>
      <div className="h-11 animate-pulse rounded-lg bg-surface-alt" />
    </div>
  );
}
