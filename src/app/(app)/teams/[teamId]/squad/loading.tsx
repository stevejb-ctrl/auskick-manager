export default function Loading() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-hairline bg-surface px-4 py-3"
        >
          <div className="h-8 w-8 animate-pulse rounded-full bg-surface-alt" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-32 animate-pulse rounded bg-surface-alt" />
            <div className="h-3 w-20 animate-pulse rounded bg-surface-alt" />
          </div>
        </div>
      ))}
    </div>
  );
}
