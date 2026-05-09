"use client";

// ─── Quarter Score Strip ───────────────────────────────────────
// Running per-quarter scoreboard, visible during play. At Q3,
// shows Q1 + Q2 totals so the coach can see the game's shape
// without waiting for the next break. Hidden at Q1 (no completed
// quarters yet) and post-game (the Game Summary card takes over).
//
// Source of truth: the live store's `scoreByQuarter` array (AFL)
// or the netball-equivalent passed in as props. This component
// just renders — it never derives or mutates score state.
//
// Sport-aware formatting:
//   AFL    — "Q1  2.1 vs 1.2"  (goals.behinds — points calc
//             happens in the parent if needed)
//   Netball — "Q1  3 vs 2"      (goals only)
//
// Steve's user feedback (2026-05-09): coaches reconcile with the
// opposition each quarter break — but mid-quarter they often
// glance back at "what happened in Q2?" and a single
// scoreboard-style strip beats hunting through a break recap.

interface QuarterScore {
  ours: { goals: number; behinds?: number };
  theirs: { goals: number; behinds?: number };
}

export interface QuarterScoreStripProps {
  /** Per-quarter scores, indexed 1..N (index 0 unused/reserved). */
  scoreByQuarter: QuarterScore[];
  /** 1..4 (or 0 pre-game). Drives the "in play" cell + which slots are completed. */
  currentQuarter: number;
  /** "afl" → render goals.behinds; "netball" → render goals only. */
  sport: "afl" | "netball";
  /** Whether the most-recent quarter has ended (Q-break) — when true the
   *  current-quarter cell shows its final tally rather than "in play". */
  quarterEnded?: boolean;
  /** Total quarters in the game. Defaults to 4. */
  totalQuarters?: number;
}

function formatScore(
  s: { goals: number; behinds?: number },
  sport: "afl" | "netball",
): string {
  if (sport === "afl") {
    const b = s.behinds ?? 0;
    return `${s.goals}.${b}`;
  }
  return `${s.goals}`;
}

export function QuarterScoreStrip({
  scoreByQuarter,
  currentQuarter,
  sport,
  quarterEnded = false,
  totalQuarters = 4,
}: QuarterScoreStripProps) {
  // Nothing useful to show before Q1 has any score.
  if (currentQuarter < 1) return null;
  // Q1 in progress with no break yet → no completed quarters →
  // strip is empty. Hide so we don't render an empty band.
  if (currentQuarter === 1 && !quarterEnded) return null;

  // Each quarter cell: completed quarters (1 .. currentQuarter-1)
  // show their final tallies; the current quarter shows either
  // its closing tally (if quarterEnded, i.e. Q-break view) or
  // "in play". Future quarters render a placeholder dash so the
  // strip's width is stable across the game.
  const cells: Array<{
    label: string;
    state: "done" | "current" | "future";
    text: string;
  }> = [];
  for (let q = 1; q <= totalQuarters; q++) {
    const slot = scoreByQuarter[q] ?? {
      ours: { goals: 0, behinds: 0 },
      theirs: { goals: 0, behinds: 0 },
    };
    if (q < currentQuarter || (q === currentQuarter && quarterEnded)) {
      cells.push({
        label: `Q${q}`,
        state: "done",
        text: `${formatScore(slot.ours, sport)} – ${formatScore(slot.theirs, sport)}`,
      });
    } else if (q === currentQuarter) {
      cells.push({ label: `Q${q}`, state: "current", text: "in play" });
    } else {
      cells.push({ label: `Q${q}`, state: "future", text: "—" });
    }
  }

  return (
    <div
      className="flex items-stretch gap-1 overflow-x-auto rounded-md border border-hairline bg-surface px-2 py-1.5 shadow-card"
      role="status"
      aria-label="Quarter-by-quarter scores"
    >
      {cells.map((c) => (
        <div
          key={c.label}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded px-2 py-1 ${
            c.state === "done"
              ? "bg-surface-alt"
              : c.state === "current"
                ? "bg-brand-50"
                : "bg-transparent"
          }`}
        >
          <span
            className={`font-mono text-[10px] font-bold uppercase tracking-micro ${
              c.state === "future" ? "text-ink-mute" : "text-ink-dim"
            }`}
          >
            {c.label}
          </span>
          <span
            className={`nums mt-0.5 font-mono text-xs font-semibold tabular-nums ${
              c.state === "done"
                ? "text-ink"
                : c.state === "current"
                  ? "text-brand-700"
                  : "text-ink-mute"
            }`}
          >
            {c.text}
          </span>
        </div>
      ))}
    </div>
  );
}
