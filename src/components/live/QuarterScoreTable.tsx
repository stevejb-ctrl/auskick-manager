"use client";

// ─── Quarter Score Table ───────────────────────────────────────
// Reusable per-quarter breakdown table, used by:
//   • QuarterScoreModal (drill-down from the in-game scorebug)
//   • QuarterBreak / NetballQuarterBreak (expanded "Review and
//     update scores" panel at the break)
//
// Sport-aware formatting:
//   AFL      — "2.1 (13)"  (goals.behinds + total points)
//   Netball  — "3"         (goals only)
//
// Each completed quarter row (and the one in play, so far) shows the
// per-Q score, the cumulative total in (parens), and a colour-coded
// margin column.

interface QuarterScore {
  ours: { goals: number; behinds?: number };
  theirs: { goals: number; behinds?: number };
}

export interface QuarterScoreTableProps {
  scoreByQuarter: QuarterScore[];
  currentQuarter: number;
  quarterEnded: boolean;
  sport: "afl" | "netball";
  teamName: string;
  opponentName: string;
  totalQuarters?: number;
  /** Row label letter ("Q", or "H" for halves). */
  periodLetter?: string;
  /** Column heading for the periods ("Quarter", or "Half"). */
  periodWord?: string;
}

function fmtScore(
  s: { goals: number; behinds?: number },
  sport: "afl" | "netball",
): { primary: string; pts: number } {
  if (sport === "afl") {
    const g = s.goals;
    const b = s.behinds ?? 0;
    return { primary: `${g}.${b}`, pts: g * 6 + b };
  }
  return { primary: `${s.goals}`, pts: s.goals };
}

function fmtMargin(diff: number): string {
  if (diff === 0) return "—";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

export function QuarterScoreTable({
  scoreByQuarter,
  currentQuarter,
  quarterEnded,
  sport,
  teamName,
  opponentName,
  totalQuarters = 4,
  periodLetter = "Q",
  periodWord = "Quarter",
}: QuarterScoreTableProps) {
  type Row = {
    label: string;
    state: "done" | "current" | "future";
    ours: string;
    theirs: string;
    margin: string;
    cumOurs: string;
    cumTheirs: string;
    cumMargin: string;
  };

  const rows: Row[] = [];
  let cumOursPts = 0;
  let cumTheirsPts = 0;
  for (let q = 1; q <= totalQuarters; q++) {
    const slot = scoreByQuarter[q] ?? {
      ours: { goals: 0, behinds: 0 },
      theirs: { goals: 0, behinds: 0 },
    };
    const o = fmtScore(slot.ours, sport);
    const t = fmtScore(slot.theirs, sport);
    cumOursPts += o.pts;
    cumTheirsPts += t.pts;
    const isDone =
      q < currentQuarter || (q === currentQuarter && quarterEnded);
    const isCurrent = q === currentQuarter && !quarterEnded;
    // The quarter in play shows its score so far (tagged "in play"):
    // dashes there hid goals the scoreboard already counted, so a fix to
    // this quarter looked like it did nothing.
    const shown = isDone || isCurrent;
    rows.push({
      label: `${periodLetter}${q}`,
      state: isDone ? "done" : isCurrent ? "current" : "future",
      ours: shown ? o.primary : "—",
      theirs: shown ? t.primary : "—",
      margin: shown ? fmtMargin(o.pts - t.pts) : "",
      cumOurs: shown ? `${cumOursPts}` : "",
      cumTheirs: shown ? `${cumTheirsPts}` : "",
      cumMargin: shown ? fmtMargin(cumOursPts - cumTheirsPts) : "",
    });
  }

  return (
    <div className="overflow-x-auto rounded-md border border-hairline">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline bg-surface-alt">
            <th className="px-3 py-2 text-left font-mono text-nano font-bold uppercase tracking-micro text-ink-dim">
              {periodWord}
            </th>
            <th className="px-3 py-2 text-right font-mono text-nano font-bold uppercase tracking-micro text-ink-dim">
              {teamName}
            </th>
            <th className="px-3 py-2 text-right font-mono text-nano font-bold uppercase tracking-micro text-ink-dim">
              {opponentName}
            </th>
            <th className="px-3 py-2 text-right font-mono text-nano font-bold uppercase tracking-micro text-ink-dim">
              Margin
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.label}
              className={`border-b border-hairline last:border-b-0 ${
                r.state === "current" ? "bg-brand-50" : ""
              }`}
            >
              <td
                className={`px-3 py-2 font-mono font-semibold ${
                  r.state === "future" ? "text-ink-mute" : "text-ink"
                }`}
              >
                {r.label}
                {r.state === "current" && (
                  <span className="ml-1 text-nano font-bold uppercase tracking-micro text-brand-700">
                    in play
                  </span>
                )}
              </td>
              <td className="nums px-3 py-2 text-right font-mono tabular-nums text-ink">
                {r.ours}
                {r.state !== "future" && r.cumOurs && (
                  <span className="ml-1 text-nano font-normal text-ink-mute">
                    ({r.cumOurs})
                  </span>
                )}
              </td>
              <td className="nums px-3 py-2 text-right font-mono tabular-nums text-ink">
                {r.theirs}
                {r.state !== "future" && r.cumTheirs && (
                  <span className="ml-1 text-nano font-normal text-ink-mute">
                    ({r.cumTheirs})
                  </span>
                )}
              </td>
              <td
                className={`nums px-3 py-2 text-right font-mono tabular-nums font-semibold ${
                  r.state !== "done"
                    ? "text-ink-mute"
                    : r.margin.startsWith("+")
                      ? "text-ok"
                      : r.margin.startsWith("-")
                        ? "text-warn"
                        : "text-ink-dim"
                }`}
              >
                {r.margin || "—"}
                {r.state !== "future" && r.cumMargin && (
                  <span className="ml-1 text-nano font-normal text-ink-mute">
                    ({r.cumMargin})
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
