import { FieldShell } from "./FieldShell";

interface AflOvalFieldProps {
  accent: string;
  tintOpacity?: number;
}

/**
 * Diagrammatic AFL oval per the multi-sport handoff spec:
 *
 *   - Outer oval (boundary): ellipse rx=80 ry=100, centre (100,110)
 *   - Inner oval (50m arc): ellipse rx=55 ry=75
 *   - Centre square: 24x24 at (88,98)
 *   - Centre circle: r=8
 *   - Three horizontal zone separators (dashed) at y=60, 110, 160
 *   - Zone labels FWD / CEN / BCK in the left gutter, rotated -90°
 *   - Goal squares: small rects at the top + bottom of the oval
 *
 * Markings stroke `var(--field-stroke)` so the shell controls the
 * cream colour centrally.
 */
export function AflOvalField({ accent, tintOpacity }: AflOvalFieldProps) {
  return (
    <FieldShell
      accent={accent}
      tintOpacity={tintOpacity}
      ariaLabel="AFL oval — three zones, centre square, 50m arc"
    >
      {/* Outer boundary oval. */}
      <ellipse
        cx="100"
        cy="110"
        rx="80"
        ry="100"
        fill="none"
        stroke="var(--field-stroke)"
        strokeWidth="1.8"
      />

      {/* 50m arc (inner concentric oval). */}
      <ellipse
        cx="100"
        cy="110"
        rx="55"
        ry="75"
        fill="none"
        stroke="var(--field-stroke-faint)"
        strokeWidth="0.8"
      />

      {/* Zone separators — dashed horizontals at y=60, 110, 160.
          The handoff calls for three, but in practice y=110 reads
          better as a continuous line through the centre square, so
          we draw two dashed dividers (top + bottom thirds) and let
          the centre square mark the midline. */}
      <line
        x1="22"
        y1="60"
        x2="178"
        y2="60"
        stroke="var(--field-stroke-faint)"
        strokeWidth="1"
        strokeDasharray="6 6"
      />
      <line
        x1="22"
        y1="160"
        x2="178"
        y2="160"
        stroke="var(--field-stroke-faint)"
        strokeWidth="1"
        strokeDasharray="6 6"
      />

      {/* Centre square. */}
      <rect
        x="88"
        y="98"
        width="24"
        height="24"
        fill="none"
        stroke="var(--field-stroke)"
        strokeWidth="1.8"
      />

      {/* Centre circle. */}
      <circle
        cx="100"
        cy="110"
        r="8"
        fill="none"
        stroke="var(--field-stroke)"
        strokeWidth="1.5"
      />

      {/* Goal squares — top + bottom of the oval, narrow + tall to
          read as the goal zone. */}
      <rect
        x="94"
        y="10"
        width="12"
        height="8"
        fill="none"
        stroke="var(--field-stroke)"
        strokeWidth="1.5"
      />
      <rect
        x="94"
        y="202"
        width="12"
        height="8"
        fill="none"
        stroke="var(--field-stroke)"
        strokeWidth="1.5"
      />

      {/* Zone labels — left gutter, rotated -90°. */}
      <text
        x="10"
        y="35"
        transform="rotate(-90 10 35)"
        fill="var(--field-stroke-faint)"
        fontSize="9"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight="600"
        letterSpacing="2"
      >
        FWD
      </text>
      <text
        x="10"
        y="115"
        transform="rotate(-90 10 115)"
        fill="var(--field-stroke-faint)"
        fontSize="9"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight="600"
        letterSpacing="2"
      >
        CEN
      </text>
      <text
        x="10"
        y="195"
        transform="rotate(-90 10 195)"
        fill="var(--field-stroke-faint)"
        fontSize="9"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight="600"
        letterSpacing="2"
      >
        BCK
      </text>
    </FieldShell>
  );
}
