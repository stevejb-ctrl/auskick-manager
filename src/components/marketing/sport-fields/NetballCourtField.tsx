import { FieldShell } from "./FieldShell";

interface NetballCourtFieldProps {
  accent: string;
  tintOpacity?: number;
}

/**
 * Diagrammatic Netball court per the multi-sport handoff spec:
 *
 *   - Outer court rect: 140x180 at (30,20), narrower than the rugby
 *     pitches because a netball court is genuinely narrower
 *   - Two third-lines: solid at y=80 + y=140 (Goal Third / Centre /
 *     Goal Third)
 *   - Centre circle: r=12 outline + filled centre dot
 *   - Goal semi-circles ("shooting circles") at each end — the
 *     ONLY places a goal can be scored from
 *   - Hoops: small outlined circles at y=20 + y=200
 *   - Zone labels ATT / CEN / DEF (same gutter positioning as AFL)
 *
 * Field tint reads plum, not grass-green — netball is an indoor
 * sport and the tint signals that.
 */
export function NetballCourtField({
  accent,
  tintOpacity,
}: NetballCourtFieldProps) {
  return (
    <FieldShell
      accent={accent}
      tintOpacity={tintOpacity}
      ariaLabel="Netball court — three thirds, two shooting semi-circles, two hoops"
    >
      {/* Outer court — narrower than the rugby pitches. */}
      <rect
        x="30"
        y="20"
        width="140"
        height="180"
        fill="none"
        stroke="var(--field-stroke)"
        strokeWidth="1.8"
      />

      {/* Third lines — Goal Third / Centre / Goal Third. */}
      <line
        x1="30"
        y1="80"
        x2="170"
        y2="80"
        stroke="var(--field-stroke)"
        strokeWidth="1.8"
      />
      <line
        x1="30"
        y1="140"
        x2="170"
        y2="140"
        stroke="var(--field-stroke)"
        strokeWidth="1.8"
      />

      {/* Goal semi-circles — the only place a goal can be scored.
          Top half-circle bulges INTO the court (downwards) from the
          baseline; bottom mirrors it upwards. */}
      <path
        d="M 70 20 A 30 30 0 0 0 130 20"
        fill="none"
        stroke="var(--field-stroke)"
        strokeWidth="1.8"
      />
      <path
        d="M 70 200 A 30 30 0 0 1 130 200"
        fill="none"
        stroke="var(--field-stroke)"
        strokeWidth="1.8"
      />

      {/* Centre circle + filled centre spot. */}
      <circle
        cx="100"
        cy="110"
        r="12"
        fill="none"
        stroke="var(--field-stroke)"
        strokeWidth="1.5"
      />
      <circle cx="100" cy="110" r="2" fill="var(--field-stroke)" />

      {/* Hoops — outlined small circles at top + bottom centrelines. */}
      <circle
        cx="100"
        cy="20"
        r="3"
        fill="none"
        stroke="var(--field-stroke)"
        strokeWidth="1.5"
      />
      <circle
        cx="100"
        cy="200"
        r="3"
        fill="none"
        stroke="var(--field-stroke)"
        strokeWidth="1.5"
      />

      {/* Zone labels removed Steve 2026-05-26 — at the picker-card
          scale the text was reading as noise. See AflOvalField for
          the full rationale. */}
    </FieldShell>
  );
}
