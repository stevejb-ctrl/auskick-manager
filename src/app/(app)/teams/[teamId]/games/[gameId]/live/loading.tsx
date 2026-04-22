export default function Loading() {
  return (
    <div className="space-y-3">
      <div className="h-14 animate-pulse rounded-lg border border-hairline bg-surface" />
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="h-7 w-44 animate-pulse rounded-md bg-surface-alt" />
        <div className="h-4 w-28 animate-pulse rounded bg-surface-alt" />
      </div>
    </div>
  );
}
