import Link from "next/link";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowHref?: (row: T) => string;
  empty?: string;
}

/**
 * Simple table with shared border/divider tokens. Row click navigates when
 * `rowHref` is provided — in that case the first cell wraps in a Link so the
 * full row acts like a link target.
 */
export function DataTable<T>({
  columns,
  rows,
  rowHref,
  empty = "No rows.",
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-hairline bg-surface-alt px-4 py-8 text-center text-sm text-ink-mute">
        {empty}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
      <table className="min-w-full divide-y divide-hairline text-sm">
        <thead className="bg-surface-alt">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 text-left text-[11px] font-bold uppercase tracking-micro text-ink-mute ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((row, i) => {
            const href = rowHref?.(row);
            return (
              <tr
                key={i}
                className={href ? "hover:bg-surface-alt" : undefined}
              >
                {columns.map((col, ci) => {
                  const content = col.render(row);
                  if (href && ci === 0) {
                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-2 text-ink ${col.className ?? ""}`}
                      >
                        <Link className="block" href={href}>
                          {content}
                        </Link>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={col.key}
                      className={`px-3 py-2 text-ink-dim ${col.className ?? ""}`}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
