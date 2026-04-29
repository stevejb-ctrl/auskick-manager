interface KpiCardProps {
  label: string;
  value: number | string;
  sub?: string;
}

// `text-[11px] font-bold uppercase tracking-micro` is the eyebrow style
// used elsewhere on /admin (table column headers, section eyebrows), so
// `getByText("Teams")` etc. are ambiguous in tests. The wrapper carries a
// stable `data-testid="admin-kpi-{slug}"` derived from the label so
// e2e specs can pin to exactly one card per metric.
export function KpiCard({ label, value, sub }: KpiCardProps) {
  return (
    <div
      className="rounded-lg border border-hairline bg-surface p-4 shadow-card"
      data-testid={`admin-kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="text-[11px] font-bold uppercase tracking-micro text-ink-mute">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold text-ink tabular-nums">
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-xs text-ink-mute tabular-nums">{sub}</div>
      )}
    </div>
  );
}
