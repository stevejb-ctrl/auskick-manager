"use client";

// ─── Quarter Score Modal ───────────────────────────────────────
// Tap the "Q-by-Q" chip in the scorebug → this modal opens with
// the full quarter-by-quarter breakdown PLUS cumulative running
// totals and per-quarter lead margins. Steve's user feedback
// 2026-05-09 (after the QuarterScoreStrip shipped): "There's room
// in the in-game scorebug (under the score) to open a quarter
// by quarter modal" — the strip is glance-level, the modal is
// drill-down.
//
// Sport-aware formatting:
//   AFL      — "2.1 (13)"  (goals.behinds + total points)
//   Netball  — "3"         (goals only)

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface QuarterScore {
  ours: { goals: number; behinds?: number };
  theirs: { goals: number; behinds?: number };
}

interface QuarterScoreModalProps {
  /** Per-quarter scores, indexed 1..N (index 0 unused/reserved). */
  scoreByQuarter: QuarterScore[];
  /** Drives the "in play" cell + which quarters are completed. */
  currentQuarter: number;
  /** True when the most-recent quarter has ended (Q-break view). */
  quarterEnded: boolean;
  /** "afl" → goals.behinds (pts); "netball" → goals only. */
  sport: "afl" | "netball";
  /** Coach's team name + opposition — render as column headers. */
  teamName: string;
  opponentName: string;
  /** Total quarters in the game (defaults to 4). */
  totalQuarters?: number;
  /** Tap outside / close-button → fire this. */
  onClose: () => void;
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

export function QuarterScoreModal({
  scoreByQuarter,
  currentQuarter,
  quarterEnded,
  sport,
  teamName,
  opponentName,
  totalQuarters = 4,
  onClose,
}: QuarterScoreModalProps) {
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
    rows.push({
      label: `Q${q}`,
      state: isDone ? "done" : isCurrent ? "current" : "future",
      ours: isDone ? o.primary : isCurrent ? "–" : "—",
      theirs: isDone ? t.primary : isCurrent ? "–" : "—",
      margin: isDone ? fmtMargin(o.pts - t.pts) : "",
      cumOurs: isDone ? `${cumOursPts}` : "",
      cumTheirs: isDone ? `${cumTheirsPts}` : "",
      cumMargin: isDone ? fmtMargin(cumOursPts - cumTheirsPts) : "",
    });
  }

  return (
    <Modal size="md">
      <div className="space-y-4">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
            Quarter scores
          </p>
          <h2 className="text-lg font-bold text-ink">
            {teamName} <span className="text-ink-mute">vs</span> {opponentName}
          </h2>
        </div>

        <div className="overflow-x-auto rounded-md border border-hairline">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-alt">
                <th className="px-3 py-2 text-left font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
                  Quarter
                </th>
                <th className="px-3 py-2 text-right font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
                  {teamName}
                </th>
                <th className="px-3 py-2 text-right font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
                  {opponentName}
                </th>
                <th className="px-3 py-2 text-right font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
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
                      <span className="ml-1 text-[9px] font-bold uppercase tracking-micro text-brand-700">
                        in play
                      </span>
                    )}
                  </td>
                  <td className="nums px-3 py-2 text-right font-mono tabular-nums text-ink">
                    {r.ours}
                    {r.state === "done" && r.cumOurs && (
                      <span className="ml-1 text-[10px] font-normal text-ink-mute">
                        ({r.cumOurs})
                      </span>
                    )}
                  </td>
                  <td className="nums px-3 py-2 text-right font-mono tabular-nums text-ink">
                    {r.theirs}
                    {r.state === "done" && r.cumTheirs && (
                      <span className="ml-1 text-[10px] font-normal text-ink-mute">
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
                    {r.state === "done" && r.cumMargin && (
                      <span className="ml-1 text-[10px] font-normal text-ink-mute">
                        ({r.cumMargin})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="px-1 text-[11px] text-ink-mute">
          Numbers in (parentheses) are cumulative through that quarter.
          {sport === "afl"
            ? " Format: goals.behinds (points). 6 points per goal, 1 per behind."
            : " Format: goals."}
        </p>

        <Button className="w-full" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
