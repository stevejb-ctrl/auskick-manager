// PLAYERVIEW-01 + PLAYERVIEW-02 / F3 (Phase 12).
//
// `buildPlayerInsight` is the SHARED, sport-agnostic, PURE view-model
// builder behind the long-press player summary. It is consumed by all
// three sports (AFL / netball / rugby league) via PlayerInsightSummary,
// so it knows nothing about any specific sport — every zone it emits
// comes from the passed config-derived `zones` (D-03), never a hardcoded
// ALL_ZONES.
//
// Locked contract (12-CONTEXT.md):
//   D-03 zones are enumerated from the passed ZoneDef[], in display order.
//   D-04 season output is PERCENTAGES ONLY — no raw season-minutes field.
//   D-05 per-period breakdown lists every config zone per period + a total.
//   D-06 msSinceLastSub = max(0, nowAbsMs - lastSubbedOnMs); null when the
//        player was never subbed on.

import type { ZoneDef } from "@/lib/sports/types";
import { periodsOwed } from "@/lib/playbook/seasonBalance";

/** One period's per-zone played ms, as fed in by the host (replay + live overlay). */
export interface PlayerInsightPeriodInput {
  period: number;
  periodLabel: string;
  zoneMs: Record<string, number>;
}

export interface PlayerInsightInput {
  /** Labelled zones for this player's age group, in display order (config-derived). */
  zones: ZoneDef[];
  /** Zone id -> ms played THIS game (completed stints + current live stint). */
  inGameZoneMs: Record<string, number>;
  /** Per-period zone-ms breakdown, in period order. */
  perPeriod: PlayerInsightPeriodInput[];
  /** Zone id -> season ms (completed games only). */
  seasonZoneMs: Record<string, number>;
  /**
   * One period in the same units as seasonZoneMs (AFL keeps minutes, so
   * the quarter length in minutes; netball counts quarters, so 1). When
   * given, zones the player is owed a period or more are flagged (UX plan
   * 4.4, season balance in the player view).
   */
  seasonPeriod?: number;
  /** Absolute frame ms the player most recently went bench->field; null = never. */
  lastSubbedOnMs: number | null;
  /** Absolute game-elapsed ms now: completedPeriodMs + current-period elapsed. */
  nowAbsMs: number;
  /**
   * Whether the kid is on the field right now. `false` (on the bench)
   * stops the "On" time: it measured time since they last came on, and
   * kept ticking after they went off (UX audit 23 Oct 2026). Omitted =
   * on the field, as before.
   */
  onField?: boolean;
}

export interface InGameZoneRow {
  id: string;
  label: string;
  shortLabel: string;
  ms: number;
}

export interface PerPeriodZoneRow {
  id: string;
  shortLabel: string;
  ms: number;
}

export interface PerPeriodRow {
  period: number;
  periodLabel: string;
  zones: PerPeriodZoneRow[];
  totalMs: number;
}

/** Season row is PERCENTAGES ONLY (D-04) — deliberately no `ms`/`minutes`. */
export interface SeasonZoneRow {
  id: string;
  label: string;
  shortLabel: string;
  pct: number;
  /** Owed at least a period of time here this season (season balance). */
  owed: boolean;
}

export interface PlayerInsight {
  inGameZones: InGameZoneRow[];
  inGameTotalMs: number;
  perPeriod: PerPeriodRow[];
  msSinceLastSub: number | null;
  /** Played earlier and on the bench now ("On the bench", no On time). */
  onBench: boolean;
  seasonZonePct: SeasonZoneRow[];
}

/**
 * Pure: builds the long-press player summary view-model. Never mutates its
 * input and returns equal output for equal input.
 */
export function buildPlayerInsight(input: PlayerInsightInput): PlayerInsight {
  const { zones, inGameZoneMs, perPeriod, seasonZoneMs, lastSubbedOnMs, nowAbsMs } =
    input;

  // In-game: exactly the config zones, in order; absent zones read 0.
  const inGameZones: InGameZoneRow[] = zones.map((z) => ({
    id: z.id,
    label: z.label,
    shortLabel: z.shortLabel,
    ms: inGameZoneMs[z.id] ?? 0,
  }));
  const inGameTotalMs = inGameZones.reduce((acc, z) => acc + z.ms, 0);

  // Per-period: preserve incoming period order; list every config zone.
  const perPeriodOut: PerPeriodRow[] = perPeriod.map((p) => {
    const zoneRows: PerPeriodZoneRow[] = zones.map((z) => ({
      id: z.id,
      shortLabel: z.shortLabel,
      ms: p.zoneMs[z.id] ?? 0,
    }));
    return {
      period: p.period,
      periodLabel: p.periodLabel,
      zones: zoneRows,
      totalMs: zoneRows.reduce((acc, z) => acc + z.ms, 0),
    };
  });

  // D-06: clamp to 0; null passes straight through. A kid on the bench
  // has no On time.
  const onBench = input.onField === false && lastSubbedOnMs !== null;
  const msSinceLastSub =
    lastSubbedOnMs === null || onBench ? null : Math.max(0, nowAbsMs - lastSubbedOnMs);

  // D-04: percentages of the player's own season total. All-zero -> 0 (no NaN).
  const seasonTotal = zones.reduce((acc, z) => acc + (seasonZoneMs[z.id] ?? 0), 0);
  const owed =
    input.seasonPeriod && input.seasonPeriod > 0 && seasonTotal > 0
      ? periodsOwed({ byUnit: seasonZoneMs, units: zones.map((z) => z.id), periodMs: input.seasonPeriod })
      : {};
  const seasonZonePct: SeasonZoneRow[] = zones.map((z) => ({
    id: z.id,
    label: z.label,
    shortLabel: z.shortLabel,
    pct:
      seasonTotal > 0
        ? Math.round(((seasonZoneMs[z.id] ?? 0) / seasonTotal) * 100)
        : 0,
    owed: (owed[z.id] ?? 0) >= 1,
  }));

  return {
    inGameZones,
    inGameTotalMs,
    perPeriod: perPeriodOut,
    msSinceLastSub,
    onBench,
    seasonZonePct,
  };
}

export interface BreakInsightInput {
  /** Labelled zones for this player's age group, in display order. */
  zones: ZoneDef[];
  /**
   * Zone id -> cumulative ms played THIS game. MUST be milliseconds (the
   * unit `buildPlayerInsight` formats) — at the quarter break this is the
   * store's `basePlayedZoneMs`, NOT the minutes-scaled `currentGameZoneMins`.
   */
  inGameZoneMs: Record<string, number>;
  /** Zone id -> season total (any consistent unit — output is % only). */
  seasonZoneMs: Record<string, number>;
  /** One period in the season's unit, to flag owed zones (optional). */
  seasonPeriod?: number;
}

/**
 * Build the PlayerInsightInput for the QUARTER-BREAK long-press sheet
 * (issues 8/9). The break clock is stopped, so there's no live stint and
 * "time since last sub" doesn't apply — `lastSubbedOnMs` is null and
 * per-period is omitted (the summary hides both sections). The in-game
 * breakdown + season mix come straight through.
 *
 * Pure; centralises the ms-not-minutes contract so the break sheet can't
 * silently regress to feeding minutes (which would render times 60× too
 * small).
 */
export function breakInsightInput(input: BreakInsightInput): PlayerInsightInput {
  return {
    zones: input.zones,
    inGameZoneMs: input.inGameZoneMs ?? {},
    perPeriod: [],
    seasonZoneMs: input.seasonZoneMs ?? {},
    seasonPeriod: input.seasonPeriod,
    lastSubbedOnMs: null,
    nowAbsMs: 0,
  };
}
