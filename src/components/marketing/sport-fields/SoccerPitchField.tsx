import { FieldShell } from "./FieldShell";

interface SoccerPitchFieldProps {
  accent: string;
  tintOpacity?: number;
  /** Pass through to FieldShell — see its strokeTheme doc. */
  strokeTheme?: "on-dark" | "on-light";
}

/**
 * Diagrammatic football (soccer) pitch, in the same frame as the other
 * sport fields (the 160x192 rectangle at (20,14) the rugby pitches use):
 *
 *   - Halfway line with a centre circle and spot
 *   - A penalty box and a six-yard box at each end
 *   - A penalty spot in front of each goal, and the goal mouth drawn on
 *     the goal line (the giveaway vs. rugby's H-posts)
 */
export function SoccerPitchField({ accent, tintOpacity, strokeTheme }: SoccerPitchFieldProps) {
  return (
    <FieldShell
      accent={accent}
      tintOpacity={tintOpacity}
      strokeTheme={strokeTheme}
      ariaLabel="Football (soccer) pitch — halfway line, centre circle, penalty boxes, goals"
    >
      {/* Outer pitch. */}
      <rect x="20" y="14" width="160" height="192" rx="2" fill="none" stroke="var(--field-stroke)" strokeWidth="1.8" />

      {/* Halfway line, centre circle and spot. */}
      <line x1="20" y1="110" x2="180" y2="110" stroke="var(--field-stroke)" strokeWidth="1.8" />
      <circle cx="100" cy="110" r="22" fill="none" stroke="var(--field-stroke)" strokeWidth="1.5" />
      <circle cx="100" cy="110" r="2.5" fill="var(--field-stroke)" />

      {/* Penalty boxes. */}
      <rect x="56" y="14" width="88" height="36" fill="none" stroke="var(--field-stroke)" strokeWidth="1.5" />
      <rect x="56" y="170" width="88" height="36" fill="none" stroke="var(--field-stroke)" strokeWidth="1.5" />

      {/* Six-yard boxes. */}
      <rect x="80" y="14" width="40" height="14" fill="none" stroke="var(--field-stroke-faint)" strokeWidth="1" />
      <rect x="80" y="192" width="40" height="14" fill="none" stroke="var(--field-stroke-faint)" strokeWidth="1" />

      {/* Penalty spots. */}
      <circle cx="100" cy="40" r="1.8" fill="var(--field-stroke)" />
      <circle cx="100" cy="180" r="1.8" fill="var(--field-stroke)" />

      {/* Goal mouths, just behind each goal line. */}
      <rect x="90" y="9" width="20" height="5" fill="none" stroke="var(--field-stroke)" strokeWidth="1.8" />
      <rect x="90" y="206" width="20" height="5" fill="none" stroke="var(--field-stroke)" strokeWidth="1.8" />
    </FieldShell>
  );
}
