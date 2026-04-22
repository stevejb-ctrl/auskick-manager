export default function Loading() {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="h-3 w-20 animate-pulse rounded bg-surface-alt" />
        <div className="h-28 animate-pulse rounded-lg border border-hairline bg-surface" />
        <div className="h-14 animate-pulse rounded-lg border border-hairline bg-surface" />
      </section>
      <section className="space-y-3">
        <div className="h-3 w-12 animate-pulse rounded bg-surface-alt" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-hairline bg-surface"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
