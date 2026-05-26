import { FieldShell } from "./FieldShell";

interface RugbyUnionFieldProps {
  accent: string;
  tintOpacity?: number;
}

/**
 * Diagrammatic Rugby Union pitch per the multi-sport handoff spec:
 *
 *   - Outer pitch rect: 160x192 at (20,14), same outline as League
 *     (the two sports share a rectangular pitch shape)
 *   - Try lines: solid at y=34 + y=186 (same as League)
 *   - **22m lines** — SOLID, y=68 + y=152 (the visual giveaway
 *     vs. League's dashed 10m lines)
 *   - **10m offside lines** — dashed, y=88 + y=132
 *   - Halfway line: solid at y=110 with cream centre dot
 *   - **H-posts** inset on the try lines — vertical pair + crossbar.
 *     The crossbar is the second giveaway: League's posts have no
 *     visible crossbar at this scale.
 *   - Zone labels: FWD (top) and BK (bottom) — Union forwards/backs
 *     aren't spatially divided the way AFL/netball zones are, so
 *     only two labels (not three).
 */
export function RugbyUnionField({ accent, tintOpacity }: RugbyUnionFieldProps) {
  return (
    <FieldShell
      accent={accent}
      tintOpacity={tintOpacity}
      ariaLabel="Rugby union pitch — try lines, 22m + 10m markings, H-posts"
    >
      {/* Outer pitch — identical outline to League. */}
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

      {/* 22m lines — SOLID. The visual giveaway vs. League's dashed
          10m lines. */}
      <line
        x1="20"
        y1="68"
        x2="180"
        y2="68"
        stroke="var(--field-stroke)"
        strokeWidth="1.5"
      />
      <line
        x1="20"
        y1="152"
        x2="180"
        y2="152"
        stroke="var(--field-stroke)"
        strokeWidth="1.5"
      />

      {/* 10m offside lines (dashed). */}
      <line
        x1="20"
        y1="88"
        x2="180"
        y2="88"
        stroke="var(--field-stroke-faint)"
        strokeWidth="1"
        strokeDasharray="6 6"
      />
      <line
        x1="20"
        y1="132"
        x2="180"
        y2="132"
        stroke="var(--field-stroke-faint)"
        strokeWidth="1"
        strokeDasharray="6 6"
      />

      {/* Halfway line + centre dot. */}
      <line
        x1="20"
        y1="110"
        x2="180"
        y2="110"
        stroke="var(--field-stroke)"
        strokeWidth="1.8"
      />
      <circle cx="100" cy="110" r="2.5" fill="var(--field-stroke)" />

      {/* H-posts inset on each try line — vertical pair + crossbar.
          Crossbar at ~1/3 of the way down between dead-ball and try
          line. Posts are tall enough to read as Union's signature
          tall uprights. */}
      {/* Top H-post. */}
      <line
        x1="92"
        y1="14"
        x2="92"
        y2="48"
        stroke="var(--field-stroke)"
        strokeWidth="2"
      />
      <line
        x1="108"
        y1="14"
        x2="108"
        y2="48"
        stroke="var(--field-stroke)"
        strokeWidth="2"
      />
      <line
        x1="92"
        y1="30"
        x2="108"
        y2="30"
        stroke="var(--field-stroke)"
        strokeWidth="2"
      />
      {/* Bottom H-post. */}
      <line
        x1="92"
        y1="172"
        x2="92"
        y2="206"
        stroke="var(--field-stroke)"
        strokeWidth="2"
      />
      <line
        x1="108"
        y1="172"
        x2="108"
        y2="206"
        stroke="var(--field-stroke)"
        strokeWidth="2"
      />
      <line
        x1="92"
        y1="190"
        x2="108"
        y2="190"
        stroke="var(--field-stroke)"
        strokeWidth="2"
      />

      {/* Zone labels removed Steve 2026-05-26 — at the picker-card
          scale the text was reading as noise. See AflOvalField for
          the full rationale. */}
    </FieldShell>
  );
}
