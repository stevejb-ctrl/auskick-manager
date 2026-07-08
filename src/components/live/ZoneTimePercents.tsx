// Per-position % of a player's season on-field time — a clear, explicit
// alternative to the proportional bar. Forward = orange, Centre = green,
// Back = blue, matching the zone tokens used everywhere else.
//
// Shown under each player in the pre-game lineup picker so a coach
// setting the lineup by hand can see, at a glance, who's had little of a
// zone and start them there. Steve 2026-07-07.
//
// Half-lines fold into their family (hfwd→fwd, hback→back). Percentages
// are rounded independently, so they may not sum to exactly 100 — each
// reads as "share of this player's season time in that position".

import type { ZoneMinutes } from "@/lib/fairness";

export function ZoneTimePercents({
  zones,
  className = "",
}: {
  zones: ZoneMinutes | undefined;
  className?: string;
}) {
  const fwd = (zones?.fwd ?? 0) + (zones?.hfwd ?? 0);
  const mid = zones?.mid ?? 0;
  const back = (zones?.back ?? 0) + (zones?.hback ?? 0);
  const total = fwd + mid + back;

  // No history → render nothing. The old per-row "No season time yet"
  // repeated 13× on a fresh team; the parent shows ONE squad-level note
  // instead (UX review #8, Steve 2026-07-08).
  if (total <= 0) return null;

  const pct = (v: number) => Math.round((v / total) * 100);
  return (
    <span
      className={`flex items-center gap-2.5 font-mono text-[11px] font-semibold tabular-nums ${className}`}
      aria-label={`Season time — Forward ${pct(fwd)}%, Centre ${pct(mid)}%, Back ${pct(back)}%`}
    >
      <span className="text-zone-f">Fwd {pct(fwd)}%</span>
      <span className="text-zone-c">Cen {pct(mid)}%</span>
      <span className="text-zone-b">Back {pct(back)}%</span>
    </span>
  );
}
