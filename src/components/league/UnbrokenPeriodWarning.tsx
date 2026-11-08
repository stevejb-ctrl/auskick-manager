"use client";

// ─── UnbrokenPeriodWarning ───────────────────────────────────
// Live-game note on Junior Laws §6 (unbroken periods): a sun banner under
// the top bar (live v3), so the coach sees it while making sub decisions. It names only kids
// the coach can still do something for (UX audit, 23 Oct 2026: it was
// never shown):
//
//   * Stay on to the hooter — kids on track for an unbroken period
//     they can't make up later. The sub card leaves them on too
//     (mustStayOn reads the same walk).
//   * Play all next period — kids not on track now who need every period
//     left, so they start the next one and play it out.
//
// Two lines at 390 px (Phase 12; it wrapped to three): the law, then
// each list on one line in tile names, "+N" past what fits. A screen
// reader hears every full name.
//
// Kids who can no longer make it, and kids hurt or lent, aren't listed:
// the break's check and the stats report those.

import { useMemo } from "react";
import { unbrokenPeriodNeeds, unbrokenPeriodsRequired } from "@/lib/sports/rugby_league/fairness";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { GameEvent, Player } from "@/lib/types";
import { periodLabels, type RugbySport } from "@/lib/sports";
import { namesThatFit } from "@/lib/live/namesThatFit";

interface UnbrokenPeriodWarningProps {
  /** The team's rugby sport: its words for the period. */
  sport: RugbySport;
  /** Kids in this game (field and bench). */
  players: Player[];
  events: GameEvent[];
  ageGroup: AgeGroupConfig;
  currentQuarter: number;
  /**
   * Playing time elapsed in the period (ms): an injury past the §7
   * three-minute carve-out counts as broken from that moment.
   */
  currentElapsedMs: number;
  /** Hurt or lent kids: not named. */
  sidelined: ReadonlySet<string>;
  /** A kid's tile name ("Zara Q"), for the one-line lists. */
  shortName?: (p: Player) => string;
}

/** Characters a banner line holds at 390 px (13 px type). */
const LINE_CHARS = 44;

export function UnbrokenPeriodWarning({
  sport,
  players,
  events,
  ageGroup,
  currentQuarter,
  currentElapsedMs,
  sidelined,
  shortName = (p) => p.full_name,
}: UnbrokenPeriodWarningProps) {
  const required = unbrokenPeriodsRequired(ageGroup);
  const needs = useMemo(
    () =>
      unbrokenPeriodNeeds(events, {
        required,
        currentQuarter,
        periodCount: ageGroup.periodCount,
        elapsedMs: currentElapsedMs,
      }),
    [events, required, currentQuarter, ageGroup.periodCount, currentElapsedMs],
  );
  if (required === 0) return null;

  const named = (ids: string[]) => players.filter((p) => ids.includes(p.id) && !sidelined.has(p.id));
  const stay = named(needs.mustStay);
  const start = named(needs.mustStartNext);
  if (stay.length === 0 && start.length === 0) return null;

  const { label: periodNoun, plural: periodNounPlural } = periodLabels(sport, ageGroup);
  const rows: { key: string; title: string; kids: Player[] }[] = [
    { key: "stay", title: "Stay on to the hooter", kids: stay },
    { key: "start", title: `Play all next ${periodNoun}`, kids: start },
  ];

  return (
    <section
      aria-label="Unbroken periods"
      data-testid="unbroken-period-warning"
      className="rounded-[12px] bg-sun-soft px-3 py-2 text-[0.8125rem] leading-snug text-ink"
    >
      <p className="truncate font-semibold">
        §6: everyone plays {required} unbroken {required === 1 ? periodNoun : periodNounPlural}
      </p>
      {rows
        .filter((r) => r.kids.length > 0)
        .map((r) => (
          <p key={r.key} data-testid={`unbroken-${r.key}`} className="truncate">
            <span className="font-semibold">{r.title}:</span>{" "}
            <span aria-hidden>{namesThatFit(r.kids.map(shortName), LINE_CHARS - r.title.length - 2).text}</span>
            <span className="sr-only">{r.kids.map((p) => p.full_name).join(", ")}</span>
          </p>
        ))}
    </section>
  );
}
