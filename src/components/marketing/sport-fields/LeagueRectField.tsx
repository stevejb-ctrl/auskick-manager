import { FieldShell } from "./FieldShell";

interface LeagueRectFieldProps {
  accent: string;
  tintOpacity?: number;
  /** Pass through to FieldShell — see its strokeTheme doc. */
  strokeTheme?: "on-dark" | "on-light";
}

/**
 * Diagrammatic Rugby League pitch per the multi-sport handoff spec:
 *
 *   - Outer pitch rect: 160x192 at (20,14), rx=2
 *   - Try lines: solid at y=34 + y=186
 *   - In-goal areas: cream at 6% fill between try line + dead-ball line
 *   - Dead-ball lines: dashed at y=18 + y=202
 *   - 10m lines: dashed at y=58 + y=162 (where defenders line up at play-the-ball)
 *   - 20m lines: hairline solid at y=82 + y=138
 *   - Halfway line: solid at y=110 with cream centre spot
 *   - Goal posts: short verticals through each try line
 *   - Zone labels FWD / HLF / BCK
 *
 * The 10m and 20m lines are the visual giveaway that this is League,
 * not Union (which uses 22m + 10m offside lines instead).
 */
export function LeagueRectField({
  accent,
  tintOpacity,
  strokeTheme,
}: LeagueRectFieldProps) {
  return (
    <FieldShell
      accent={accent}
      tintOpacity={tintOpacity}
      strokeTheme={strokeTheme}
      ariaLabel="Rugby league pitch — try lines, 10m + 20m markings, halfway"
    >
      {/* Outer pitch. */}
      <rect
        x="20"
        y="14"
        width="160"
        height="192"
        rx="2"
        fill="none"
        stroke="var(--field-stroke)"
        strokeWidth="1.8"
      />

      {/* In-goal areas — cream at 6% between try line + dead-ball line. */}
      <rect
        x="20"
        y="14"
        width="160"
        height="20"
        fill="var(--field-fill-soft)"
      />
      <rect
        x="20"
        y="186"
        width="160"
        height="20"
        fill="var(--field-fill-soft)"
      />

      {/* Dead-ball lines (dashed). */}
      <line
        x1="20"
        y1="18"
        x2="180"
        y2="18"
        stroke="var(--field-stroke-faint)"
        strokeWidth="1"
        strokeDasharray="6 6"
      />
      <line
        x1="20"
        y1="202"
        x2="180"
        y2="202"
        stroke="var(--field-stroke-faint)"
        strokeWidth="1"
        strokeDasharray="6 6"
      />

      {/* Try lines (solid). */}
      <line
        x1="20"
        y1="34"
        x2="180"
        y2="34"
        stroke="var(--field-stroke)"
        strokeWidth="1.8"
      />
      <line
        x1="20"
        y1="186"
        x2="180"
        y2="186"
        stroke="var(--field-stroke)"
        strokeWidth="1.8"
      />

      {/* 10m lines (dashed) — where defenders stand at play-the-ball. */}
      <line
        x1="20"
        y1="58"
        x2="180"
        y2="58"
        stroke="var(--field-stroke-faint)"
        strokeWidth="1"
        strokeDasharray="6 6"
      />
      <line
        x1="20"
        y1="162"
        x2="180"
        y2="162"
        stroke="var(--field-stroke-faint)"
        strokeWidth="1"
        strokeDasharray="6 6"
      />

      {/* 20m lines (solid hairline). */}
      <line
        x1="20"
        y1="82"
        x2="180"
        y2="82"
        stroke="var(--field-stroke-faint)"
        strokeWidth="0.8"
      />
      <line
        x1="20"
        y1="138"
        x2="180"
        y2="138"
        stroke="var(--field-stroke-faint)"
        strokeWidth="0.8"
      />

      {/* Halfway line + centre spot. */}
      <line
        x1="20"
        y1="110"
        x2="180"
        y2="110"
        stroke="var(--field-stroke)"
        strokeWidth="1.8"
      />
      <circle cx="100" cy="110" r="3.5" fill="var(--field-stroke)" />

      {/* Goal posts — short verticals through each try line. */}
      <line
        x1="92"
        y1="14"
        x2="92"
        y2="34"
        stroke="var(--field-stroke)"
        strokeWidth="2"
      />
      <line
        x1="108"
        y1="14"
        x2="108"
        y2="34"
        stroke="var(--field-stroke)"
        strokeWidth="2"
      />
      <line
        x1="92"
        y1="186"
        x2="92"
        y2="206"
        stroke="var(--field-stroke)"
        strokeWidth="2"
      />
      <line
        x1="108"
        y1="186"
        x2="108"
        y2="206"
        stroke="var(--field-stroke)"
        strokeWidth="2"
      />

      {/* Zone labels removed Steve 2026-05-26 — at the picker-card
          scale the text was reading as noise. See AflOvalField for
          the full rationale. */}
    </FieldShell>
  );
}
