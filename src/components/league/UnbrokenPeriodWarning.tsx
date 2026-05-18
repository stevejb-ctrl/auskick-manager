"use client";

// ─── UnbrokenPeriodWarning ───────────────────────────────────
// Inline live-game warning that flags players who haven't yet
// banked their minimum unbroken-period count (Junior Laws §6).
// Sits between the field and the scoring section so the coach
// sees it WHILE making sub decisions, not after the fact.
//
// Two states:
//
//   * At-risk during play — players who haven't met the minimum
//     yet AND aren't currently on the field locked in for THIS
//     period. Listed prominently so the coach knows to send them
//     on for the next period.
//
//   * Locked in this period — players currently on the field who,
//     if they stay on, will earn an unbroken period at the hooter.
//     Subtle hint chip so the coach knows not to swap them off.
//
// The component reads the SAME helper the dashboard uses
// (`unbrokenPeriodLiveStatus`) so the live + post-game views
// stay consistent.

import { useMemo } from "react";
import { unbrokenPeriodLiveStatus } from "@/lib/sports/rugby_league/fairness";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { GameEvent, Player } from "@/lib/types";

interface UnbrokenPeriodWarningProps {
  squad: Player[];
  events: GameEvent[];
  ageGroup: AgeGroupConfig;
  /** Hide when no period has kicked off yet — nothing to warn about. */
  active: boolean;
}

export function UnbrokenPeriodWarning({
  squad,
  events,
  ageGroup,
  active,
}: UnbrokenPeriodWarningProps) {
  const required = ageGroup.minUnbrokenPeriods ?? 0;
  const status = useMemo(
    () => unbrokenPeriodLiveStatus(events, required),
    [events, required],
  );

  if (!active || required === 0) return null;

  // Two buckets: at-risk (closed periods so far < required AND not
  // currently in-progress earning one) and on-track (currently
  // banking one this period).
  const atRisk: Player[] = [];
  const onTrack: Player[] = [];

  for (const p of squad) {
    const s = status[p.id];
    if (!s) {
      atRisk.push(p);
      continue;
    }
    if (s.compliant) continue; // already met the minimum
    if (s.provisionallyCompliant && s.inProgressPeriods.length > 0) {
      onTrack.push(p);
    } else {
      atRisk.push(p);
    }
  }

  if (atRisk.length === 0 && onTrack.length === 0) return null;

  const periodNoun = ageGroup.periodLabel ?? "period";
  const periodNounPlural = ageGroup.periodLabelPlural ?? `${periodNoun}s`;

  return (
    <section
      aria-label="Unbroken-period compliance"
      className="rounded-xl border border-warn/40 bg-warn-soft p-3 shadow-card"
    >
      <header className="mb-1.5 px-1">
        <h2 className="text-xs font-bold uppercase tracking-wide text-warn">
          Laws §6 — unbroken {periodNounPlural}
        </h2>
        <p className="text-xs text-warn">
          Every player needs at least {required}{" "}
          unbroken {required === 1 ? periodNoun : periodNounPlural} of play.
        </p>
      </header>

      {atRisk.length > 0 && (
        <div className="space-y-1 px-1">
          <p className="text-xs font-semibold text-warn">
            At risk — needs an unbroken {periodNoun} still
          </p>
          <div className="flex flex-wrap gap-1.5">
            {atRisk.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs text-ink ring-1 ring-warn/30"
              >
                <span className="font-mono text-[10px] tabular-nums text-ink-mute">
                  #{p.jersey_number ?? "—"}
                </span>
                {p.full_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {onTrack.length > 0 && (
        <div className="mt-2 space-y-1 px-1">
          <p className="text-xs font-semibold text-ink-dim">
            On track this {periodNoun} — don&apos;t sub off
          </p>
          <div className="flex flex-wrap gap-1.5">
            {onTrack.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2 py-0.5 text-xs text-ink"
              >
                <span className="font-mono text-[10px] tabular-nums text-ink-mute">
                  #{p.jersey_number ?? "—"}
                </span>
                {p.full_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
