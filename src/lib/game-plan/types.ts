// ─── Pre-game rotation plan — sport-agnostic shape ───────────
// A "game plan" is the coach's pre-kickoff projection of who plays
// where across every period of a game. It's the planning-time mirror
// of the post-game summary: auto-generated from the same fairness
// suggesters, tweakable by the coach, then copy/pasted into a group
// chat so the team knows the rotation expectations before the siren.
//
// The shape is deliberately sport-neutral so one formatter + one
// modal serve AFL (zones), netball (positions) and rugby league
// (forwards / backs). Each sport's projector (see ./project) fills
// the same `GamePlanPeriod[]` structure; only the group ids/labels
// differ.

import type { SportId } from "@/lib/sports/types";
import type { PlayerChip } from "@/lib/types";
import type { ChipMode } from "@/lib/chips";
import type { GameEvent } from "@/lib/types";

/** One on-field group within a period (a zone, a position, or a pool). */
export interface GamePlanGroup {
  /** Stable id — AFL zone id, netball position id, or "forwards"/"backs". */
  groupId: string;
  /** Display label ("Centre", "GS", "Forwards"). */
  groupLabel: string;
  /** Player ids assigned to this group for this period, in order. */
  playerIds: string[];
}

/** One period of the plan (a quarter / half / period). */
export interface GamePlanPeriod {
  /** 1-indexed period number. */
  period: number;
  /** Short label using the resolved period noun ("Q1", "H2", "P3"). */
  label: string;
  /** On-field groups in canonical render order. */
  groups: GamePlanGroup[];
  /**
   * Player ids starting this period off the field. When the plan
   * `rotatesWithinPeriod` (AFL rolling subs), this is an ordered
   * interchange queue — index 0 comes on first — not a static bench.
   */
  bench: string[];
}

/**
 * Per-player rotation tally. The plan is about WHO IS WHERE each
 * period, not minutes-per-kid, so this carries only the start count —
 * how many periods a player begins on the field. (Used by the edit op
 * to enumerate the squad and by the projector's fairness tests.)
 */
export interface GamePlanPlayerTotal {
  playerId: string;
  /** Number of periods this player starts on the field. */
  periodsOnField: number;
}

/** The full projected plan for one game. */
export interface GamePlan {
  sport: SportId;
  /** Periods in order (length = projected period count). */
  periods: GamePlanPeriod[];
  /** Per-player start tally, sorted most → fewest periods on field. */
  totals: GamePlanPlayerTotal[];
  /** Resolved period noun for this plan ("quarter"/"half"/"period"). */
  periodLabel: "quarter" | "half" | "period";
  periodLabelPlural: "quarters" | "halves" | "periods";
  /** Minutes per period (for the period-length subhead). */
  periodMinutes: number;
  /**
   * True when the plan rotates players within each period via rolling
   * subs (AFL). Then each period's `bench` is an ordered interchange
   * queue (next-on first) rather than a static bench. Netball
   * (period-break-only subs) and rugby league (Law-6 unbroken blocks)
   * leave this false.
   */
  rotatesWithinPeriod: boolean;
  /** Rolling-sub cadence in seconds — set only when rotatesWithinPeriod. */
  subIntervalSeconds?: number;
}

/**
 * Input to `projectGamePlan`. Pure data — no Supabase, no React.
 *
 * The caller computes nothing sport-specific: it hands over the squad,
 * the resolved age-group config, the on-field size, and (optionally)
 * the team's season + chip data. The projector picks the right
 * fairness engine per `sport` and loops it across every period.
 */
export interface ProjectGamePlanInput {
  sport: SportId;
  /** Resolved age-group config (drives positions, period count, minutes). */
  ageGroup: import("@/lib/sports/types").AgeGroupConfig;
  /** Available players for this game, in display order. */
  players: { id: string; chip?: PlayerChip | null }[];
  /** On-field size for this game (clamped to the age-group bounds). */
  onFieldSize: number;
  /**
   * Season events across the team's prior games. Drives season-level
   * fairness in the AFL / netball suggesters (which zone/position each
   * kid is "owed"). Omit / empty for a fresh team — the plan still
   * rotates fairly within the game.
   */
  seasonEvents?: GameEvent[];
  /**
   * Number of periods to project. Defaults to `ageGroup.periodCount`.
   * Exposed mainly for tests; production always uses the age default.
   */
  periodCount?: number;
  /** Minutes per period override. Defaults to `ageGroup.periodSeconds / 60`. */
  periodMinutes?: number;
  /**
   * Rolling-sub cadence override in seconds. Defaults to
   * `ageGroup.subIntervalSeconds`. The live plan-ahead caller passes the
   * GAME's actual cadence so the plan screen never shows a stale age
   * default (issue 8).
   */
  subIntervalSeconds?: number;
  /** Deterministic seed so the same squad yields the same plan. */
  seed?: number;
  /** Per-player chip key (a|b|c|null) — drives chip-aware placement. */
  chipByPlayerId?: Record<string, PlayerChip | null | undefined>;
  /** Per-chip mode (split/group/forward/centre/back). */
  chipModeByKey?: Partial<Record<PlayerChip, ChipMode>>;
  /**
   * The coach's CURRENT on-field shape (groupId -> player ids), when the
   * plan is projected mid-game from live reality (see
   * `projectUpcomingRotation`). When present, the AFL projector LOCKS this
   * zone distribution into the caps for every projected period instead of
   * re-deriving the age-group default — so a short squad's manual split
   * (e.g. a 10-kid 3/4/3 in a 12-slot game) survives from quarter to
   * quarter. Omitted for cold pre-game plans. Steve 2026-07-07.
   */
  currentGroups?: Record<string, string[]>;
}
