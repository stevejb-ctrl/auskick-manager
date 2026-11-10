// ─── Season time, in words ───────────────────────────────────
// The pre-game picker used to draw each kid's season time in zone as a
// three-colour bar under a "Season time in zone" key. Live v3 says it
// in words (Steve, 8 Nov 2026: words, not bars): the line a kid has had
// least of this season, which is where a coach placing the lineup by
// hand looks to start them ("Least Fwd"). A screen reader hears the
// whole split. Pure.

import type { Zone } from "@/lib/types";

/** A line and the minutes on it this season. */
export interface SeasonLine {
  key: string;
  /** Short, for the tile: "Fwd", "Centre", "Back". */
  short: string;
  /** Whole, for a screen reader: "Forward". */
  label: string;
  minutes: number;
}

export interface SeasonWords {
  text: string;
  spoken: string;
}

/**
 * "Least Fwd" for a kid with season time, or null: no time yet, a single
 * line, or the time already spread evenly (no line under its share by a
 * tenth of their time or more).
 */
export function seasonLeastWords(lines: readonly SeasonLine[]): SeasonWords | null {
  if (lines.length < 2) return null;
  const total = lines.reduce((t, l) => t + Math.max(0, l.minutes), 0);
  if (total <= 0) return null;
  const least = lines.reduce((a, b) => (b.minutes < a.minutes ? b : a));
  const most = lines.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  if ((most.minutes - least.minutes) / total < 0.1) return null;
  const split = lines.map((l) => `${l.label} ${Math.round((Math.max(0, l.minutes) / total) * 100)}%`).join(", ");
  return { text: `Least ${least.short}`, spoken: `Least season time at ${least.label}: ${split}` };
}

/**
 * AFL's lines from a kid's season minutes by zone, for the zones on this
 * field (positionsFor: three or five).
 */
export function aflSeasonLines(
  minutes: Partial<Record<Zone, number>> | undefined,
  zones: readonly Zone[],
  short: Record<Zone, string>,
  label: Record<Zone, string>,
): SeasonLine[] {
  if (!minutes) return [];
  return zones.map((z) => ({ key: z, short: short[z], label: label[z], minutes: minutes[z] ?? 0 }));
}
