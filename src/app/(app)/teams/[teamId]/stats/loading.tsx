export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-10 animate-pulse rounded-lg bg-surface-alt" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
          <div className="h-5 w-36 animate-pulse rounded bg-surface-alt" />
          <div className="h-40 animate-pulse rounded bg-surface-alt" />
        </div>
      ))}
    </div>
  );
}
