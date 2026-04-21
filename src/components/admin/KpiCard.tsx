interface KpiCardProps {
  label: string;
  value: number | string;
  sub?: string;
}

export function KpiCard({ label, value, sub }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card">
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
