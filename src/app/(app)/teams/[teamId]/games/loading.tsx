export default function Loading() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-lg border border-hairline bg-surface"
        />
      ))}
    </div>
  );
}
