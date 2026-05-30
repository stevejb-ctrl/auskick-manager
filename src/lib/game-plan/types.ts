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

/** Per-player planned game time, used by the copy footer. */
export interface GamePlanPlayerTotal {
  playerId: string;
  /** Number of periods this player is on the field. */
  periodsOnField: number;
  /** Approx planned on-field minutes (periodsOnField × period minutes). */
  minutes: number;
}

/** The full projected plan for one game. */
export interface GamePlan {
  sport: SportId;
  /** Periods in order (length = projected period count). */
  periods: GamePlanPeriod[];
  /** Per-player planned game time, sorted most → least minutes. */
  totals: GamePlanPlayerTotal[];
  /** Resolved period noun for this plan ("quarter"/"half"/"period"). */
  periodLabel: "quarter" | "half" | "period";
  periodLabelPlural: "quarters" | "halves" | "periods";
  /** Minutes per period (for footer copy and the modal subhead). */
  periodMinutes: number;
  /**
   * True when the plan rotates players within each period via rolling
   * subs (AFL). Then each period's `bench` is an ordered interchange
   * queue (next-on first) and `totals.minutes` assume even within-period
   * rotation rather than whole-period blocks. Netball (period-break-only
   * subs) and rugby league (Law-6 unbroken blocks) leave this false.
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
  /** Deterministic seed so the same squad yields the same plan. */
  seed?: number;
  /** Per-player chip key (a|b|c|null) — drives chip-aware placement. */
  chipByPlayerId?: Record<string, PlayerChip | null | undefined>;
  /** Per-chip mode (split/group/forward/centre/back). */
  chipModeByKey?: Partial<Record<PlayerChip, ChipMode>>;
}
