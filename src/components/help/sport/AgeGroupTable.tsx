import { getSportConfig } from "@/lib/sports";
import type { AgeGroupConfig, SportId } from "@/lib/sports/types";

/** One more column, from the sport's own age-group settings (keeper, vests, …). */
export interface AgeGroupColumn {
  title: string;
  value: (ag: AgeGroupConfig) => string;
}

interface Row {
  from: string;
  to: string;
  cells: string[];
}

/**
 * The formats Siren sets for each age group, read from the sport's
 * config (src/lib/sports/<sport>), so the help can't drift from the
 * app. Neighbouring ages with the same format share a row.
 */
export function AgeGroupTable({ sport, extra = [] }: { sport: SportId; extra?: AgeGroupColumn[] }) {
  const cfg = getSportConfig(sport);
  const surface = cfg.words.surface === "court" ? "On court" : "On the field";
  const rows: Row[] = [];
  for (const ag of cfg.ageGroups) {
    const plural = ag.periodLabelPlural ?? cfg.periodLabelPlural;
    const range = ag.minOnFieldSize === ag.maxOnFieldSize ? "" : ` (${ag.minOnFieldSize}–${ag.maxOnFieldSize})`;
    const cells = [
      `${ag.defaultOnFieldSize}${range}`,
      `${ag.periodCount} × ${Math.round(ag.periodSeconds / 60)} min ${plural}`,
      ag.tracksScoreDefault ? "Kept" : "Not kept",
      ...extra.map((c) => c.value(ag)),
    ];
    const last = rows[rows.length - 1];
    if (last && last.cells.join("|") === cells.join("|")) last.to = ag.label;
    else rows.push({ from: ag.label, to: ag.label, cells });
  }
  const headings = ["Age group", surface, "Game", "Score", ...extra.map((c) => c.title)];
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-hairline bg-surface shadow-card">
      <table className="w-full min-w-[28rem] text-left text-sm" data-testid="help-age-groups">
        <caption className="sr-only">{cfg.name} age groups in Siren</caption>
        <thead className="bg-surface-alt text-xs text-ink-mute">
          <tr>
            {headings.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline text-ink-dim">
          {rows.map((r) => (
            <tr key={r.from}>
              <th scope="row" className="whitespace-nowrap px-3 py-2 font-medium text-ink">
                {r.from === r.to ? r.from : `${r.from} – ${r.to}`}
              </th>
              {r.cells.map((c, i) => (
                <td key={i} className="px-3 py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
