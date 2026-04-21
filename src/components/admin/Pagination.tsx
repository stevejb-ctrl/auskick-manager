"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface PaginationProps {
  cursor: number;
  nextCursor: number | null;
  pageSize: number;
  total: number;
}

/** URL-cursor pagination. Reads `?cursor=N` and emits links for prev/next. */
export function Pagination({
  cursor,
  nextCursor,
  pageSize,
  total,
}: PaginationProps) {
  const pathname = usePathname();
  const params = useSearchParams();

  function href(nextCursor: number | null) {
    const p = new URLSearchParams(params.toString());
    if (nextCursor === null || nextCursor <= 0) p.delete("cursor");
    else p.set("cursor", String(nextCursor));
    const qs = p.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  }

  const prevCursor = cursor > 0 ? Math.max(0, cursor - pageSize) : null;
  const start = total === 0 ? 0 : cursor + 1;
  const end = Math.min(cursor + pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 text-xs text-ink-mute tabular-nums">
      <span>
        {total === 0 ? "0 rows" : `${start}–${end} of ${total}`}
      </span>
      <div className="flex gap-1">
        {prevCursor !== null ? (
          <Link
            href={href(prevCursor)}
            className="rounded-md border border-hairline bg-surface px-2 py-1 text-ink-dim hover:bg-surface-alt"
          >
            ← Prev
          </Link>
        ) : (
          <span className="rounded-md border border-hairline bg-surface-alt px-2 py-1 text-ink-mute opacity-50">
            ← Prev
          </span>
        )}
        {nextCursor !== null ? (
          <Link
            href={href(nextCursor)}
            className="rounded-md border border-hairline bg-surface px-2 py-1 text-ink-dim hover:bg-surface-alt"
          >
            Next →
          </Link>
        ) : (
          <span className="rounded-md border border-hairline bg-surface-alt px-2 py-1 text-ink-mute opacity-50">
            Next →
          </span>
        )}
      </div>
    </div>
  );
}
