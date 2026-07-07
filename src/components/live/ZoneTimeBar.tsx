// Shared proportional "time in zone" bar — forward-first (orange →
// green → blue), so it lines up with the ZoneTimeLegend (Fwd / Centre /
// Back). Half-lines fold into their family (hfwd→fwd, hback→back).
//
// Used to show a player's SEASON zone split in the pre-game lineup
// picker so a coach setting the lineup by hand can see who's had little
// time in a zone and start them there. Steve 2026-07-07.
//
// Pure presentational — pass any ZoneMinutes (season or single-game);
// the bar only cares about proportions.

import type { ZoneMinutes } from "@/lib/fairness";

export function ZoneTimeBar({
  zones,
  className = "",
}: {
  zones: ZoneMinutes | undefined;
  /** Extra classes for the track (width/height live here). */
  className?: string;
}) {
  const fwd = (zones?.fwd ?? 0) + (zones?.hfwd ?? 0);
  const mid = zones?.mid ?? 0;
  const back = (zones?.back ?? 0) + (zones?.hback ?? 0);
  const total = fwd + mid + back;
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  return (
    <span
      className={`flex h-1.5 overflow-hidden rounded-full bg-surface-alt ${className}`}
      aria-label={
        total > 0
          ? `Season time — Fwd ${Math.round(fwd)}m, Centre ${Math.round(mid)}m, Back ${Math.round(back)}m`
          : "No season time yet"
      }
    >
      {total > 0 && (
        <>
          <span style={{ width: `${pct(fwd)}%` }} className="bg-zone-f" />
          <span style={{ width: `${pct(mid)}%` }} className="bg-zone-c" />
          <span style={{ width: `${pct(back)}%` }} className="bg-zone-b" />
        </>
      )}
    </span>
  );
}
