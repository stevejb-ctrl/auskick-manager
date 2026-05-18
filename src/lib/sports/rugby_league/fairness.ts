// ─── Rugby league replay + (basic) fairness ───────────────────
// Phase 3 ships a minimum replay engine the live game + dashboard
// need: lineup over time, current quarter / clock / score, per-
// player tries + conversion attempts. The unbroken-period
// compliance check (Junior Law §6) and the vest / kick rotation
// derivations land in Phases 4–6 alongside their UI surfaces.
//
// Events consumed in this phase:
//   * lineup_set           — initial / re-set lineup ({ field, bench })
//   * swap                 — rolling sub during a quarter
//   * quarter_start / end  — period transitions
//   * game_finalised       — end of game
//   * try / opponent_try   — 4-point team / opp scoring
//   * conversion_attempt   — 2-point team conversion (made flag in
//                            metadata; false records the attempt
//                            without crediting points)
//   * opponent_conversion  — 2-point opp conversion
//   * score_undo           — LIFO revert of the last scoring event
//   * player_arrived       — late arrival, append to bench
//   * injury               — remove player from field+bench until
//                            a follow-up lineup_set / swap adds them
//                            back. Phase 3 keeps it simple: drop the
//                            player from the active lineup so the live
//                            UI shows a vacancy.
//   * player_loan          — lent to opposition; same treatment as injury
//
// Deliberately deferred to later phases:
//   * Per-player time-on-field accumulation (out of scope — RL fairness
//     is "unbroken periods", not minute-accuracy zone-minutes like AFL)

import type { GameEvent, LeagueLineup, LeagueZone } from "@/lib/types";
import { normalizeLeagueLineup, leagueOnField } from "@/lib/types";
import { chipZone } from "./positions";

export interface LeagueGameState {
  lineup: LeagueLineup | null;
  currentQuarter: number;
  quarterEnded: boolean;
  quarterElapsedMs: number;
  /** Per-team scoring tally. `points` = tries * 4 + conversions * 2. */
  teamScore: { tries: number; conversions: number; points: number };
  opponentScore: { tries: number; conversions: number; points: number };
  /** Tries credited per player. The scorer's player_id on the try event. */
  playerTries: Record<string, number>;
  /**
   * Conversion attempts credited per player. `attempts` counts every
   * recorded kick (made or missed) and drives the kick-rotation cycle
   * UI in Phase 5; `made` counts successful kicks.
   */
  playerConversions: Record<string, { attempts: number; made: number }>;
  finalised: boolean;
  /** ISO timestamp of the current quarter_start event; null when quarter ended. */
  quarterStartedAt: string | null;
}

/** Empty state factory — kept in sync with the interface for callers. */
export function emptyLeagueGameState(): LeagueGameState {
  return {
    lineup: null,
    currentQuarter: 0,
    quarterEnded: false,
    quarterElapsedMs: 0,
    teamScore: { tries: 0, conversions: 0, points: 0 },
    opponentScore: { tries: 0, conversions: 0, points: 0 },
    playerTries: {},
    playerConversions: {},
    finalised: false,
    quarterStartedAt: null,
  };
}

/**
 * Replay a rugby-league game's events into a `LeagueGameState`.
 *
 * Pure function — input must already include `created_at` for stable
 * ordering. Sorts defensively in case the caller hands events in
 * insert order (DB usually does, but a write-queue replay after an
 * offline burst can land out of order if `created_at` precision is
 * tight).
 */
export function replayLeagueGame(events: GameEvent[]): LeagueGameState {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const state = emptyLeagueGameState();

  // LIFO stack of scoring events the next `score_undo` should
  // reverse. Each entry encodes how to revert.
  type UndoOp =
    | { kind: "try"; player: string | null }
    | { kind: "opp_try" }
    | { kind: "conversion"; player: string; made: boolean }
    | { kind: "opp_conversion" };
  const undoStack: UndoOp[] = [];

  /**
   * Drop a player from all three buckets. Used by `injury` and
   * `player_loan` to clear the field-or-bench slot. The actual
   * replacement (if any) lands as a subsequent swap or lineup_set.
   */
  const removeFromLineup = (playerId: string | null) => {
    if (!playerId || !state.lineup) return;
    state.lineup = {
      forwards: state.lineup.forwards.filter((p) => p !== playerId),
      backs: state.lineup.backs.filter((p) => p !== playerId),
      bench: state.lineup.bench.filter((p) => p !== playerId),
    };
  };

  for (const ev of sorted) {
    const meta = ev.metadata as {
      lineup?: Partial<LeagueLineup>;
      quarter?: number;
      elapsed_ms?: number;
      off_player_id?: string;
      on_player_id?: string;
      made?: boolean;
    };

    switch (ev.type) {
      case "lineup_set": {
        if (meta.lineup) {
          state.lineup = normalizeLeagueLineup(meta.lineup);
        }
        break;
      }

      case "swap": {
        // Rolling sub: off_player_id leaves the field, on_player_id
        // takes their slot. The on-player joins the SAME zone the
        // off-player was in (preserving the forward/back ratio
        // without any zone metadata on the event). Bench → field
        // and field → bench transitions both work via this rule;
        // a player swapping in who wasn't on the bench (late
        // arrival) goes to whichever zone the off-player vacated.
        if (!state.lineup) break;
        const off = meta.off_player_id;
        const on = meta.on_player_id;
        if (!off || !on) break;
        const forwards = state.lineup.forwards.slice();
        const backs = state.lineup.backs.slice();
        const bench = state.lineup.bench.slice();
        // Figure out where the off-player was. Default to "forward"
        // if they were already off the field somehow — gives the
        // replay forward-bias when the data is inconsistent.
        let offZone: LeagueZone = "forward";
        const fwdIdx = forwards.indexOf(off);
        const backIdx = backs.indexOf(off);
        if (backIdx >= 0) {
          offZone = "back";
          backs.splice(backIdx, 1);
        } else if (fwdIdx >= 0) {
          offZone = "forward";
          forwards.splice(fwdIdx, 1);
        }
        // Bench off-player slot — re-append unless already on bench.
        if (!bench.includes(off)) bench.push(off);
        // Pull on-player from bench / other zone if present.
        const benchIdx = bench.indexOf(on);
        if (benchIdx >= 0) bench.splice(benchIdx, 1);
        const onFwdIdx = forwards.indexOf(on);
        if (onFwdIdx >= 0) forwards.splice(onFwdIdx, 1);
        const onBackIdx = backs.indexOf(on);
        if (onBackIdx >= 0) backs.splice(onBackIdx, 1);
        // Place on-player into the off-player's vacated zone.
        if (offZone === "back") backs.push(on);
        else forwards.push(on);
        state.lineup = { forwards, backs, bench };
        break;
      }

      case "league_position_change": {
        // Coach long-pressed an on-field player and moved them
        // between forwards and backs without subbing. Single-
        // player move; the player must be on the field for the
        // change to land (defensive — a stale event on a benched
        // player is a no-op).
        if (!state.lineup || !ev.player_id) break;
        const pid = ev.player_id;
        const toZone = (meta as { to_zone?: LeagueZone }).to_zone;
        if (toZone !== "forward" && toZone !== "back") break;
        const fwd = state.lineup.forwards.filter((p) => p !== pid);
        const bks = state.lineup.backs.filter((p) => p !== pid);
        const wasOnField
          = state.lineup.forwards.includes(pid)
          || state.lineup.backs.includes(pid);
        if (!wasOnField) break;
        if (toZone === "forward") fwd.push(pid);
        else bks.push(pid);
        state.lineup = {
          forwards: fwd,
          backs: bks,
          bench: state.lineup.bench,
        };
        break;
      }

      case "quarter_start": {
        const quarter =
          typeof meta.quarter === "number" ? meta.quarter : state.currentQuarter + 1;
        state.currentQuarter = quarter;
        state.quarterEnded = false;
        state.quarterElapsedMs = 0;
        state.quarterStartedAt = ev.created_at;
        break;
      }

      case "quarter_end": {
        state.quarterEnded = true;
        state.quarterStartedAt = null;
        state.quarterElapsedMs = meta.elapsed_ms ?? state.quarterElapsedMs;
        break;
      }

      case "game_finalised": {
        state.finalised = true;
        break;
      }

      case "try": {
        state.teamScore.tries++;
        state.teamScore.points += 4;
        if (ev.player_id) {
          state.playerTries[ev.player_id] =
            (state.playerTries[ev.player_id] ?? 0) + 1;
        }
        undoStack.push({ kind: "try", player: ev.player_id });
        break;
      }

      case "opponent_try": {
        state.opponentScore.tries++;
        state.opponentScore.points += 4;
        undoStack.push({ kind: "opp_try" });
        break;
      }

      case "conversion_attempt": {
        const kicker = ev.player_id;
        const made = meta.made === true;
        if (kicker) {
          state.playerConversions[kicker] ??= { attempts: 0, made: 0 };
          state.playerConversions[kicker].attempts++;
          if (made) state.playerConversions[kicker].made++;
        }
        if (made) {
          state.teamScore.conversions++;
          state.teamScore.points += 2;
        }
        // Push the undo entry even for missed attempts so an undo
        // pops the attempt record alongside any points; the kicker
        // rotation logic in Phase 5 will use this to roll back the
        // cycle.
        undoStack.push({
          kind: "conversion",
          player: kicker ?? "",
          made,
        });
        break;
      }

      case "opponent_conversion": {
        state.opponentScore.conversions++;
        state.opponentScore.points += 2;
        undoStack.push({ kind: "opp_conversion" });
        break;
      }

      case "score_undo": {
        const op = undoStack.pop();
        if (!op) break;
        switch (op.kind) {
          case "try": {
            state.teamScore.tries = Math.max(0, state.teamScore.tries - 1);
            state.teamScore.points = Math.max(0, state.teamScore.points - 4);
            if (op.player && state.playerTries[op.player]) {
              state.playerTries[op.player] = Math.max(
                0,
                state.playerTries[op.player] - 1,
              );
            }
            break;
          }
          case "opp_try": {
            state.opponentScore.tries = Math.max(
              0,
              state.opponentScore.tries - 1,
            );
            state.opponentScore.points = Math.max(
              0,
              state.opponentScore.points - 4,
            );
            break;
          }
          case "conversion": {
            if (op.player && state.playerConversions[op.player]) {
              const slot = state.playerConversions[op.player];
              slot.attempts = Math.max(0, slot.attempts - 1);
              if (op.made) slot.made = Math.max(0, slot.made - 1);
            }
            if (op.made) {
              state.teamScore.conversions = Math.max(
                0,
                state.teamScore.conversions - 1,
              );
              state.teamScore.points = Math.max(0, state.teamScore.points - 2);
            }
            break;
          }
          case "opp_conversion": {
            state.opponentScore.conversions = Math.max(
              0,
              state.opponentScore.conversions - 1,
            );
            state.opponentScore.points = Math.max(
              0,
              state.opponentScore.points - 2,
            );
            break;
          }
        }
        break;
      }

      case "player_arrived": {
        if (state.lineup && ev.player_id) {
          // Append to bench if not already present anywhere. The
          // coach taps "Add late arrival" → server emits the event;
          // the LeagueBenchStrip will pick it up on next render.
          const allKnown = new Set([
            ...state.lineup.forwards,
            ...state.lineup.backs,
            ...state.lineup.bench,
          ]);
          if (!allKnown.has(ev.player_id)) {
            state.lineup = {
              forwards: state.lineup.forwards,
              backs: state.lineup.backs,
              bench: [...state.lineup.bench, ev.player_id],
            };
          }
        }
        break;
      }

      case "injury": {
        removeFromLineup(ev.player_id);
        break;
      }

      case "player_loan": {
        // Mirror AFL — a loaned player stays on the bench with a
        // LENT badge rather than vanishing from the lineup. The
        // rotation skips them via `loanedIds` derived in the
        // orchestrator, and the bench tile renders dimmed.
        // (Bringing them back via `loaned: false` is also handled
        // here: drop them from field if somehow there, then ensure
        // they're on the bench.)
        if (!ev.player_id || !state.lineup) break;
        const pid = ev.player_id;
        const forwards = state.lineup.forwards.filter((p) => p !== pid);
        const backs = state.lineup.backs.filter((p) => p !== pid);
        const bench = state.lineup.bench.includes(pid)
          ? state.lineup.bench
          : [...state.lineup.bench, pid];
        state.lineup = { forwards, backs, bench };
        break;
      }

      default:
        // Ignore unknown event types — keeps the replay forward-
        // compatible if a future phase introduces RL events that
        // don't affect score / lineup.
        break;
    }
  }

  return state;
}

// ─── Unbroken-period compliance (Junior Laws §6) ─────────────
// "Each player in the team is to play a MINIMUM of ONE UNBROKEN
// HALF of a match (i.e. twenty (20) minutes)." For U6–U9 that's
// 2 unbroken quarters of 8 min; for U10–U12 it's 1 unbroken half
// of 20 min. "Unbroken" = continuously on the field from period
// kickoff to period hooter, no swaps off.
//
// A player is unbroken for a period IF:
//   1. They were on the field at `quarter_start` for that period.
//   2. No subsequent `swap` (off side), `injury`, or `player_loan`
//      event removed them before the `quarter_end`.
//
// Known carve-out NOT yet modelled — Junior Laws §7 allows a
// temporary injury replacement up to 3 minutes which counts as
// part of the injured player's playing time. Honouring this fully
// requires pairing the injury event with a return-to-play event
// and measuring the gap. For Phase 6 the helper treats any injury
// or loan as a clean break — coaches who need the carve-out can
// override the warning manually. A future ticket can refine this
// once the field has confirmed how the events flow during a real
// injury replacement.

export interface UnbrokenPeriodCompliance {
  /**
   * 1-indexed period numbers where this player was on the field
   * continuously from `quarter_start` through `quarter_end`.
   */
  unbrokenPeriods: number[];
  /** Minimum unbroken periods required by the age group. */
  required: number;
  /** True when unbrokenPeriods.length >= required. */
  compliant: boolean;
}

/**
 * Compute per-player unbroken-period compliance for a single
 * game. Walks events once; per-period state is reset on
 * `quarter_start` and finalised on `quarter_end`. Players who
 * never appear in any lineup are omitted (the dashboard's caller
 * unions with the full squad list to flag bench-only players).
 */
export function unbrokenPeriodCompliance(
  events: GameEvent[],
  required: number,
): Record<string, UnbrokenPeriodCompliance> {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  // Per-period bookkeeping. starters = set of players on field at
  // quarter_start; removed = set of players who left the field
  // during the period (swap off, injury, or loan).
  type PeriodTracker = {
    starters: Set<string>;
    removed: Set<string>;
  };
  const periods = new Map<number, PeriodTracker>();

  // Tracks the current on-field set so a quarter_start can
  // snapshot it. Updated by lineup_set and swap events.
  let currentField = new Set<string>();
  let currentPeriod: number | null = null;
  const allPlayers = new Set<string>();

  for (const ev of sorted) {
    const meta = ev.metadata as {
      lineup?: Partial<LeagueLineup>;
      quarter?: number;
      off_player_id?: string;
      on_player_id?: string;
    };

    switch (ev.type) {
      case "lineup_set": {
        if (meta.lineup) {
          const lineup = normalizeLeagueLineup(meta.lineup);
          const onField = leagueOnField(lineup);
          currentField = new Set(onField);
          for (const id of onField) allPlayers.add(id);
          for (const id of lineup.bench) allPlayers.add(id);
        }
        break;
      }
      case "quarter_start": {
        currentPeriod
          = typeof meta.quarter === "number"
            ? meta.quarter
            : (currentPeriod ?? 0) + 1;
        periods.set(currentPeriod, {
          starters: new Set(currentField),
          removed: new Set(),
        });
        break;
      }
      case "quarter_end": {
        currentPeriod = null;
        break;
      }
      case "swap": {
        const off = meta.off_player_id;
        const on = meta.on_player_id;
        // Mark off-player as removed for the active period BEFORE
        // mutating currentField, so a stale-state swap with an
        // off-player no longer on field is a no-op.
        if (off && currentField.has(off)) {
          currentField.delete(off);
          if (currentPeriod !== null) {
            periods.get(currentPeriod)?.removed.add(off);
          }
        }
        if (on) {
          currentField.add(on);
          allPlayers.add(on);
        }
        break;
      }
      case "injury":
      case "player_loan": {
        const pid = ev.player_id;
        if (pid && currentField.has(pid)) {
          currentField.delete(pid);
          if (currentPeriod !== null) {
            periods.get(currentPeriod)?.removed.add(pid);
          }
        }
        break;
      }
      case "player_arrived": {
        if (ev.player_id) allPlayers.add(ev.player_id);
        break;
      }
      default:
        // Score / vest / kickoff / position_change events don't
        // change unbroken-period membership (position_change keeps
        // the player on the field).
        break;
    }
  }

  const result: Record<string, UnbrokenPeriodCompliance> = {};
  allPlayers.forEach((playerId) => {
    const unbroken: number[] = [];
    periods.forEach((t, period) => {
      if (t.starters.has(playerId) && !t.removed.has(playerId)) {
        unbroken.push(period);
      }
    });
    unbroken.sort((a, b) => a - b);
    result[playerId] = {
      unbrokenPeriods: unbroken,
      required,
      compliant: unbroken.length >= required,
    };
  });
  return result;
}

/**
 * Live-game variant: returns compliance based on events so far,
 * treating the IN-PROGRESS period as not-yet-ended (so a player
 * who's currently on field for the live period gets credit
 * PROVISIONALLY but doesn't count toward `compliant` until
 * `quarter_end` lands).
 *
 * Used by `UnbrokenPeriodWarning` to flag at-risk players
 * BEFORE the hooter, giving the coach a chance to leave them on.
 */
export interface UnbrokenPeriodLiveStatus extends UnbrokenPeriodCompliance {
  /**
   * 1-indexed periods where the player is currently on track to
   * earn an unbroken-period stamp — they started this period AND
   * haven't been removed yet. Empty when no period is in progress.
   */
  inProgressPeriods: number[];
  /**
   * Provisional compliance — true when
   * `unbrokenPeriods.length + inProgressPeriods.length >= required`.
   * The coach uses this to decide "is it safe to sub them off?".
   */
  provisionallyCompliant: boolean;
}

export function unbrokenPeriodLiveStatus(
  events: GameEvent[],
  required: number,
): Record<string, UnbrokenPeriodLiveStatus> {
  // Run the regular walker, but ALSO capture the in-progress
  // period's starters / removed at the end. We do this by
  // re-running the same logic and exposing the trailing state.
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  type PeriodTracker = {
    starters: Set<string>;
    removed: Set<string>;
    closed: boolean;
  };
  const periods = new Map<number, PeriodTracker>();
  let currentField = new Set<string>();
  let currentPeriod: number | null = null;
  const allPlayers = new Set<string>();

  for (const ev of sorted) {
    const meta = ev.metadata as {
      lineup?: Partial<LeagueLineup>;
      quarter?: number;
      off_player_id?: string;
      on_player_id?: string;
    };
    switch (ev.type) {
      case "lineup_set": {
        if (meta.lineup) {
          const lineup = normalizeLeagueLineup(meta.lineup);
          const onField = leagueOnField(lineup);
          currentField = new Set(onField);
          for (const id of onField) allPlayers.add(id);
          for (const id of lineup.bench) allPlayers.add(id);
        }
        break;
      }
      case "quarter_start": {
        currentPeriod
          = typeof meta.quarter === "number"
            ? meta.quarter
            : (currentPeriod ?? 0) + 1;
        periods.set(currentPeriod, {
          starters: new Set(currentField),
          removed: new Set(),
          closed: false,
        });
        break;
      }
      case "quarter_end": {
        if (currentPeriod !== null) {
          const t = periods.get(currentPeriod);
          if (t) t.closed = true;
        }
        currentPeriod = null;
        break;
      }
      case "swap": {
        const off = meta.off_player_id;
        const on = meta.on_player_id;
        if (off && currentField.has(off)) {
          currentField.delete(off);
          if (currentPeriod !== null) {
            periods.get(currentPeriod)?.removed.add(off);
          }
        }
        if (on) {
          currentField.add(on);
          allPlayers.add(on);
        }
        break;
      }
      case "injury":
      case "player_loan": {
        const pid = ev.player_id;
        if (pid && currentField.has(pid)) {
          currentField.delete(pid);
          if (currentPeriod !== null) {
            periods.get(currentPeriod)?.removed.add(pid);
          }
        }
        break;
      }
      case "player_arrived": {
        if (ev.player_id) allPlayers.add(ev.player_id);
        break;
      }
      default:
        break;
    }
  }

  const result: Record<string, UnbrokenPeriodLiveStatus> = {};
  allPlayers.forEach((playerId) => {
    const closed: number[] = [];
    const inProgress: number[] = [];
    periods.forEach((t, period) => {
      if (!t.starters.has(playerId) || t.removed.has(playerId)) return;
      (t.closed ? closed : inProgress).push(period);
    });
    closed.sort((a, b) => a - b);
    inProgress.sort((a, b) => a - b);
    result[playerId] = {
      unbrokenPeriods: closed,
      required,
      compliant: closed.length >= required,
      inProgressPeriods: inProgress,
      provisionallyCompliant: closed.length + inProgress.length >= required,
    };
  });
  return result;
}

// ─── Auto-suggest lineup ─────────────────────────────────────
// Coach taps "Auto suggest" on the pre-game picker. The
// suggester takes the available squad, the target on-field size,
// and the season's prior events, and returns:
//   * a `LeagueLineup` (field + bench)
//   * suggested FR / DH player ids (for U8+ when the age group
//     requires them) — bias toward players who have worn each
//     vest fewest times this season, with FR and DH guaranteed
//     to be different players.
//
// Ranking signals for the field pick (most → least important):
//   1. Unbroken-period SHORTFALL — players who haven't yet met
//      the age-group minimum across the season go first. This
//      is the laws §6 promise.
//   2. Games appeared least — second tiebreaker so coaches who
//      have a balanced squad still cycle the bench fairly.
//   3. Jersey number ascending — deterministic stable tiebreak.
//
// Vest ranking: among on-field players, prefer those with the
// FEWEST historical FR (or DH) appearances. The mutual-exclusion
// pass (FR ≠ DH) runs after the picks. If there's only one
// on-field player, only FR is filled and DH is left null —
// caller surfaces the error.

import type { Player as PlayerType } from "@/lib/types";

export interface LeagueSuggestInput {
  /** Available players to choose from (sorted however the caller wants). */
  players: PlayerType[];
  /** Target on-field size — picker fills the field bucket to this number. */
  defaultOnFieldSize: number;
  /**
   * Number of on-field slots that should be forwards. The remainder
   * (defaultOnFieldSize - forwardCount) are backs. When undefined,
   * the suggester splits roughly in half — `floor(n/2)` forwards.
   * Drives chip-aware distribution: a Forward-chipped player fills
   * a forward slot first; a Back-chipped player fills a back slot
   * first; unchipped players fill whichever pool has room.
   */
  forwardCount?: number;
  /**
   * Events from the team's prior games this season. The current game's
   * events MUST NOT be included — they don't drive a pre-kickoff
   * suggestion. Empty array = "no fairness data yet, deterministic
   * fallback by jersey number".
   */
  seasonEvents: GameEvent[];
  /** `minUnbrokenPeriods` from the age-group config. */
  requiredUnbrokenPeriods: number;
  /** Vest requirements from the age-group config — controls suggestedFr / suggestedDh. */
  vestRequirements?: { fr: boolean; dh: boolean };
}

export interface LeagueSuggestOutput {
  lineup: LeagueLineup;
  /** Suggested FR wearer (on-field player id), or null if not applicable. */
  suggestedFr: string | null;
  /** Suggested DH wearer (on-field player id), or null if not applicable. */
  suggestedDh: string | null;
}

interface SeasonFairnessRow {
  playerId: string;
  /** Number of prior games where this player FAILED to meet §6. */
  shortfall: number;
  /** Number of prior games where this player appeared at all. */
  games: number;
  /** Total FR appearances across the season. */
  frCount: number;
  /** Total DH appearances across the season. */
  dhCount: number;
}

function computeSeasonFairness(
  events: GameEvent[],
  required: number,
): Map<string, SeasonFairnessRow> {
  // Group events by game.
  const byGame = new Map<string, GameEvent[]>();
  for (const ev of events) {
    const arr = byGame.get(ev.game_id) ?? [];
    arr.push(ev);
    byGame.set(ev.game_id, arr);
  }

  const out = new Map<string, SeasonFairnessRow>();
  const slot = (id: string) => {
    let row = out.get(id);
    if (!row) {
      row = {
        playerId: id,
        shortfall: 0,
        games: 0,
        frCount: 0,
        dhCount: 0,
      };
      out.set(id, row);
    }
    return row;
  };

  byGame.forEach((gameEvents) => {
    const compliance = unbrokenPeriodCompliance(gameEvents, required);
    Object.entries(compliance).forEach(([playerId, c]) => {
      const row = slot(playerId);
      row.games++;
      if (!c.compliant) row.shortfall++;
    });
    // Vest tallies from this game's vest_assigned events.
    for (const ev of gameEvents) {
      if (ev.type !== "vest_assigned" || !ev.player_id) continue;
      const meta = ev.metadata as { vest?: string };
      if (meta.vest === "fr") slot(ev.player_id).frCount++;
      else if (meta.vest === "dh") slot(ev.player_id).dhCount++;
    }
  });

  return out;
}

export function suggestLeagueLineup(
  input: LeagueSuggestInput,
): LeagueSuggestOutput {
  const {
    players,
    defaultOnFieldSize,
    forwardCount,
    seasonEvents,
    requiredUnbrokenPeriods,
    vestRequirements,
  } = input;

  const fairness = computeSeasonFairness(
    seasonEvents,
    requiredUnbrokenPeriods,
  );

  // Field ranking — primary by shortfall desc, then games asc, then
  // jersey-number asc. Players without a fairness row (haven't
  // appeared yet) get default zeros — they sort by jersey number.
  const ranked = [...players].sort((a, b) => {
    const fa = fairness.get(a.id);
    const fb = fairness.get(b.id);
    const sa = fa?.shortfall ?? 0;
    const sb = fb?.shortfall ?? 0;
    if (sa !== sb) return sb - sa; // more shortfall first
    const ga = fa?.games ?? 0;
    const gb = fb?.games ?? 0;
    if (ga !== gb) return ga - gb; // fewer games first
    const ja = a.jersey_number ?? Number.MAX_SAFE_INTEGER;
    const jb = b.jersey_number ?? Number.MAX_SAFE_INTEGER;
    return ja - jb;
  });

  // Decide the F/B split — caller may pass `forwardCount` from the
  // age-group config (e.g. 5 for U10's 11-on-field, 4 for U8's 8).
  // Fallback halves the field with the back pool taking the odd one.
  const targetForwards
    = forwardCount !== undefined
      ? Math.max(0, Math.min(defaultOnFieldSize, forwardCount))
      : Math.floor(defaultOnFieldSize / 2);
  const targetBacks = Math.max(0, defaultOnFieldSize - targetForwards);

  // Chip-aware zone distribution. Walk the fairness-ranked list and
  // place each player by chip:
  //   * Forward chip → forwards pool until it's full, then backs.
  //   * Back chip    → backs pool until it's full, then forwards.
  //   * No chip      → wherever has room (forwards first to keep the
  //     suggestion stable when nobody is chipped).
  // Overflow players land on the bench in fairness order.
  const forwards: string[] = [];
  const backs: string[] = [];
  const bench: string[] = [];
  for (const p of ranked) {
    const zone = chipZone(p.chip);
    const place = (preferred: LeagueZone) => {
      if (
        preferred === "forward" &&
        forwards.length < targetForwards
      ) {
        forwards.push(p.id);
        return true;
      }
      if (preferred === "back" && backs.length < targetBacks) {
        backs.push(p.id);
        return true;
      }
      return false;
    };
    if (zone && place(zone)) continue;
    // Either no chip or chip's preferred zone is full — fall through
    // to whichever pool has room.
    if (forwards.length < targetForwards) forwards.push(p.id);
    else if (backs.length < targetBacks) backs.push(p.id);
    else bench.push(p.id);
  }

  const fieldPicks = [...forwards, ...backs];

  // Vest suggestions: choose among on-field players, biased toward
  // fewest historical appearances of THAT vest, with FR / DH
  // mutually exclusive.
  let suggestedFr: string | null = null;
  let suggestedDh: string | null = null;

  if (vestRequirements?.fr) {
    const frRanked = [...fieldPicks].sort((a, b) => {
      const fa = fairness.get(a)?.frCount ?? 0;
      const fb = fairness.get(b)?.frCount ?? 0;
      if (fa !== fb) return fa - fb;
      const ja = players.find((p) => p.id === a)?.jersey_number ?? 0;
      const jb = players.find((p) => p.id === b)?.jersey_number ?? 0;
      return ja - jb;
    });
    suggestedFr = frRanked[0] ?? null;
  }
  if (vestRequirements?.dh) {
    const dhPool = fieldPicks.filter((id) => id !== suggestedFr);
    const dhRanked = [...dhPool].sort((a, b) => {
      const fa = fairness.get(a)?.dhCount ?? 0;
      const fb = fairness.get(b)?.dhCount ?? 0;
      if (fa !== fb) return fa - fb;
      const ja = players.find((p) => p.id === a)?.jersey_number ?? 0;
      const jb = players.find((p) => p.id === b)?.jersey_number ?? 0;
      return ja - jb;
    });
    suggestedDh = dhRanked[0] ?? null;
  }

  return {
    lineup: { forwards, backs, bench },
    suggestedFr,
    suggestedDh,
  };
}

// ─── Per-period score tally ──────────────────────────────────
// Walks the event log + attributes each scoring event to the period
// it landed in via metadata.quarter (falls back to active-quarter
// tracking when the metadata is missing — older event rows).
// Honours `score_undo` (LIFO) so the totals reflect the surviving
// scores only.
//
// Used by `LeagueFullTimeReview` for the per-period reconcile table
// (mirrors AFL's `QuarterScoreTable` shape).

export interface LeagueScoreByPeriod {
  /** 1-indexed period number → tries / conversions / points scored in it. */
  [period: number]: {
    team: { tries: number; conversions: number; points: number };
    opponent: { tries: number; conversions: number; points: number };
  };
}

export function leagueScoreByPeriod(
  events: GameEvent[],
  periodCount: number,
): LeagueScoreByPeriod {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  // Pre-seed every period so the table always has entries to render.
  const out: LeagueScoreByPeriod = {};
  for (let p = 1; p <= periodCount; p++) {
    out[p] = {
      team: { tries: 0, conversions: 0, points: 0 },
      opponent: { tries: 0, conversions: 0, points: 0 },
    };
  }

  // Active-period fallback for events that didn't ship metadata.quarter.
  let active = 0;
  // LIFO stack of "what would this row's undo do?" — pop on score_undo.
  type Op
    = | { kind: "try"; period: number }
      | { kind: "opp_try"; period: number }
      | { kind: "conv"; period: number; made: boolean }
      | { kind: "opp_conv"; period: number };
  const stack: Op[] = [];

  for (const ev of sorted) {
    const meta = (ev.metadata ?? {}) as { quarter?: number; made?: boolean };
    if (ev.type === "quarter_start") {
      active = typeof meta.quarter === "number" ? meta.quarter : active + 1;
      continue;
    }
    if (ev.type === "quarter_end") {
      continue;
    }
    const period
      = typeof meta.quarter === "number" && meta.quarter > 0
        ? meta.quarter
        : active;
    if (period < 1) continue;
    if (!out[period]) {
      out[period] = {
        team: { tries: 0, conversions: 0, points: 0 },
        opponent: { tries: 0, conversions: 0, points: 0 },
      };
    }
    if (ev.type === "try") {
      out[period].team.tries += 1;
      out[period].team.points += 4;
      stack.push({ kind: "try", period });
    } else if (ev.type === "opponent_try") {
      out[period].opponent.tries += 1;
      out[period].opponent.points += 4;
      stack.push({ kind: "opp_try", period });
    } else if (ev.type === "conversion_attempt") {
      const made = meta.made === true;
      if (made) {
        out[period].team.conversions += 1;
        out[period].team.points += 2;
      }
      stack.push({ kind: "conv", period, made });
    } else if (ev.type === "opponent_conversion") {
      out[period].opponent.conversions += 1;
      out[period].opponent.points += 2;
      stack.push({ kind: "opp_conv", period });
    } else if (ev.type === "score_undo") {
      const op = stack.pop();
      if (!op) continue;
      const bucket
        = op.kind === "try" || op.kind === "conv" ? "team" : "opponent";
      const slot = out[op.period][bucket];
      if (op.kind === "try" || op.kind === "opp_try") {
        slot.tries = Math.max(0, slot.tries - 1);
        slot.points = Math.max(0, slot.points - 4);
      } else if (op.kind === "conv") {
        if (op.made) {
          slot.conversions = Math.max(0, slot.conversions - 1);
          slot.points = Math.max(0, slot.points - 2);
        }
      } else if (op.kind === "opp_conv") {
        slot.conversions = Math.max(0, slot.conversions - 1);
        slot.points = Math.max(0, slot.points - 2);
      }
    }
  }

  return out;
}

// ─── Per-game vest rotation suggestion ────────────────────────
// Pre-game plan for who wears FR / DH each period. Two reasons we
// want this baked in at the lineup picker:
//   1. Coaches can tell kids "you're on the FR vest for half 2" so
//      they're pumped up before kickoff.
//   2. The rotation is constrained ("one vest worn once per game") —
//      planning it up-front means the rotation is verified legal
//      across the whole game, not just opportunistically per break.
//
// The suggester picks each period independently:
//   * Pool = on-field players who haven't already been picked for
//     this vest in an earlier period of the same plan.
//   * Per-period mutual exclusion = the FR pick can't also be the
//     DH pick for that same period.
//   * Bias = least season vest history first, then jersey number.
//
// Returns `(string | null)[]` per vest, length = periodCount. A
// `null` entry means no eligible candidate (rare — e.g. squad is
// smaller than the number of periods, or every on-field player has
// already worn the vest in a previous game and the season fairness
// already loaded them).

export interface LeagueVestRotationInput {
  /** On-field player ids — the starting lineup. */
  onFieldIds: readonly string[];
  /** Full squad for jersey-number lookups + name display. */
  players: PlayerType[];
  /** Season events for fairness biasing (this game's events excluded). */
  seasonEvents: GameEvent[];
  /** Age-group required unbroken periods (drives the fairness lookup). */
  requiredUnbrokenPeriods: number;
  /** Age group vest requirements — controls whether FR / DH are produced. */
  vestRequirements?: { fr: boolean; dh: boolean };
  /** Number of periods (quarters or halves) to plan vests for. */
  periodCount: number;
}

export interface LeagueVestRotation {
  fr: (string | null)[];
  dh: (string | null)[];
}

export function suggestVestRotation(
  input: LeagueVestRotationInput,
): LeagueVestRotation {
  const {
    onFieldIds,
    players,
    seasonEvents,
    requiredUnbrokenPeriods,
    vestRequirements,
    periodCount,
  } = input;

  const fairness = computeSeasonFairness(seasonEvents, requiredUnbrokenPeriods);
  const jerseyOf = (id: string) =>
    players.find((p) => p.id === id)?.jersey_number ?? Number.MAX_SAFE_INTEGER;

  const rank = (
    pool: string[],
    countFor: (row: SeasonFairnessRow | undefined) => number,
  ) =>
    [...pool].sort((a, b) => {
      const ca = countFor(fairness.get(a));
      const cb = countFor(fairness.get(b));
      if (ca !== cb) return ca - cb;
      return jerseyOf(a) - jerseyOf(b);
    });

  const fr: (string | null)[] = [];
  const dh: (string | null)[] = [];
  const usedFr = new Set<string>();
  const usedDh = new Set<string>();

  for (let p = 0; p < periodCount; p++) {
    let frPick: string | null = null;
    let dhPick: string | null = null;
    if (vestRequirements?.fr) {
      const pool = onFieldIds.filter((id) => !usedFr.has(id));
      const ranked = rank(pool, (row) => row?.frCount ?? 0);
      frPick = ranked[0] ?? null;
      if (frPick) usedFr.add(frPick);
    }
    if (vestRequirements?.dh) {
      const pool = onFieldIds.filter(
        (id) => !usedDh.has(id) && id !== frPick,
      );
      const ranked = rank(pool, (row) => row?.dhCount ?? 0);
      dhPick = ranked[0] ?? null;
      if (dhPick) usedDh.add(dhPick);
    }
    fr.push(frPick);
    dh.push(dhPick);
  }

  return { fr, dh };
}

// ─── Per-player time on field ─────────────────────────────────
// Sums each player's total minutes on the field across the whole
// game. Used by LeaguePlayerTile to render the AFL-style `#7 · 8:42`
// time readout beneath the player's name.
//
// Implementation walks the event log once, tracking each player's
// current stint start (within the active period) and accumulating
// closed stints. Live ongoing stints in the active period extend to
// `currentElapsedMs`; ended periods extend to their `quarter_end`
// `elapsed_ms`. Injury / loan close a stint exactly like a swap-off.

export function playerMsOnField(
  events: GameEvent[],
  currentQuarter: number,
  currentElapsedMs: number,
): Record<string, number> {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const total: Record<string, number> = {};
  // stintStart[playerId] = elapsed_ms within the active period at
  // which their current on-field stint began. Players not in this
  // record are currently off-field.
  const stintStart: Record<string, number> = {};
  let activeQuarter: number | null = null;
  // Current latest lineup_set lineup (most recent snapshot seen so
  // far). Used by quarter_start to seed who's on the field at the
  // hooter. Both members typed up-front so the in-place .filter +
  // .push update on swap doesn't trip the "implicit any" inference.
  let snapshot: LeagueLineup | null = null;

  const closeStint = (playerId: string, endElapsed: number) => {
    const start = stintStart[playerId];
    if (start === undefined) return;
    total[playerId] = (total[playerId] ?? 0) + Math.max(0, endElapsed - start);
    delete stintStart[playerId];
  };

  for (const ev of sorted) {
    const meta = (ev.metadata ?? {}) as {
      lineup?: Partial<LeagueLineup>;
      quarter?: number;
      elapsed_ms?: number;
      off_player_id?: string;
      on_player_id?: string;
    };
    switch (ev.type) {
      case "lineup_set": {
        if (meta.lineup) {
          snapshot = normalizeLeagueLineup(meta.lineup);
        }
        break;
      }
      case "quarter_start": {
        // Close any leftover open stints from a missing quarter_end.
        for (const id of Object.keys(stintStart)) {
          closeStint(id, 0);
        }
        activeQuarter
          = typeof meta.quarter === "number"
            ? meta.quarter
            : (activeQuarter ?? 0) + 1;
        if (snapshot) {
          for (const id of leagueOnField(snapshot)) {
            stintStart[id] = 0;
          }
        }
        break;
      }
      case "quarter_end": {
        const endElapsed
          = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
        for (const id of Object.keys(stintStart)) {
          closeStint(id, endElapsed);
        }
        activeQuarter = null;
        break;
      }
      case "swap": {
        const at = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
        if (meta.off_player_id) closeStint(meta.off_player_id, at);
        if (meta.on_player_id && stintStart[meta.on_player_id] === undefined) {
          stintStart[meta.on_player_id] = at;
        }
        // Mirror the swap into snapshot so a subsequent
        // quarter_start seeds the right field set even after rolling
        // subs in earlier periods. The on-player joins whichever
        // zone the off-player vacated (same rule as the main
        // replayer); a late arrival (on-player not on bench) lands
        // in that vacated zone too.
        if (snapshot && meta.off_player_id && meta.on_player_id) {
          const off = meta.off_player_id;
          const on = meta.on_player_id;
          let forwards: string[] = snapshot.forwards.slice();
          let backs: string[] = snapshot.backs.slice();
          let bench: string[] = snapshot.bench.slice();
          let offZone: LeagueZone = "forward";
          const fIdx = forwards.indexOf(off);
          const bIdx = backs.indexOf(off);
          if (bIdx >= 0) {
            offZone = "back";
            backs.splice(bIdx, 1);
          } else if (fIdx >= 0) {
            offZone = "forward";
            forwards.splice(fIdx, 1);
          }
          if (!bench.includes(off)) bench.push(off);
          const benchIdx = bench.indexOf(on);
          if (benchIdx >= 0) bench.splice(benchIdx, 1);
          forwards = forwards.filter((id) => id !== on);
          backs = backs.filter((id) => id !== on);
          if (offZone === "back") backs.push(on);
          else forwards.push(on);
          snapshot = { forwards, backs, bench };
        }
        break;
      }
      case "league_position_change": {
        // Position changes don't break stints (player stays on the
        // field). Mirror into snapshot so a later quarter_start
        // seeds the correct field set.
        if (snapshot && ev.player_id) {
          const pid = ev.player_id;
          const toZone = (meta as { to_zone?: LeagueZone }).to_zone;
          if (toZone === "forward" || toZone === "back") {
            const wasOnField
              = snapshot.forwards.includes(pid)
              || snapshot.backs.includes(pid);
            if (wasOnField) {
              const nextForwards: string[] = snapshot.forwards.filter(
                (p) => p !== pid,
              );
              const nextBacks: string[] = snapshot.backs.filter(
                (p) => p !== pid,
              );
              if (toZone === "forward") nextForwards.push(pid);
              else nextBacks.push(pid);
              snapshot = {
                forwards: nextForwards,
                backs: nextBacks,
                bench: snapshot.bench,
              };
            }
          }
        }
        break;
      }
      case "injury":
      case "player_loan": {
        const at = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
        if (ev.player_id) closeStint(ev.player_id, at);
        break;
      }
      default:
        break;
    }
  }

  // Live: close any open stints in the active period at the current
  // elapsed time so the readout updates each tick.
  if (activeQuarter === currentQuarter) {
    for (const id of Object.keys(stintStart)) {
      total[id]
        = (total[id] ?? 0) + Math.max(0, currentElapsedMs - stintStart[id]);
    }
  }

  return total;
}

// ─── Next-sub suggestion (rolling rotation) ───────────────────
// Surfaces the next-due rotation pair during live play. The
// orchestrator passes:
//   * The full event log so we can walk stint history.
//   * The current period.
//   * The current lineup ({ forwards, backs, bench }).
//   * Players who CANNOT come off this period (FR / DH wearers —
//     they keep the vest the whole period unless replaced via the
//     forced injury-replacement modal).
//   * Current period-elapsed ms.
//   * Optional per-player chip lookup. When supplied, the on-pick
//     prefers a bench player whose chip matches the OFF-player's
//     CURRENT ZONE (forwards / backs) so the field's forward-back
//     ratio stays stable across rotations. Soft preference — if no
//     chip-matched bench player is available, fall back to the
//     overall longest-on-bench (same behaviour as before).
//
// Output: { off, on, zone } pair with how long each has been in
// their current spot this period and which zone the swap-on
// player should join. `zone` mirrors the off-player's zone so the
// caller can emit a swap event whose replay lands the on-player
// in the same bucket. Returns null when there's no swappable
// candidate (empty bench, everyone vest-locked, period not
// active).

export interface LeagueSubSuggestion {
  off: { playerId: string; msOnField: number };
  on: { playerId: string; msOnBench: number };
  /** Zone the off-player vacated — the on-player joins this zone. */
  zone: LeagueZone;
}

export function suggestNextLeagueSub(
  events: GameEvent[],
  currentQuarter: number,
  currentLineup: LeagueLineup,
  excludeOffPlayers: readonly string[],
  elapsedMs: number,
  chipByPlayerId?: ReadonlyMap<string, import("@/lib/types").PlayerChip | null>,
): LeagueSubSuggestion | null {
  const onFieldIds = leagueOnField(currentLineup);
  if (onFieldIds.length === 0 || currentLineup.bench.length === 0) {
    return null;
  }
  const excludeSet = new Set(excludeOffPlayers);
  type Stint = { startedAt: number; location: "field" | "bench" };
  const stint = new Map<string, Stint>();
  for (const ev of events) {
    const meta = (ev.metadata ?? {}) as {
      quarter?: number;
      elapsed_ms?: number;
      off_player_id?: string;
      on_player_id?: string;
      lineup?: Partial<LeagueLineup>;
    };
    if (ev.type === "lineup_set" && meta.lineup) {
      const lineup = normalizeLeagueLineup(meta.lineup);
      for (const id of leagueOnField(lineup)) {
        stint.set(id, { startedAt: 0, location: "field" });
      }
      for (const id of lineup.bench) {
        stint.set(id, { startedAt: 0, location: "bench" });
      }
      continue;
    }
    if (meta.quarter !== currentQuarter) continue;
    if (ev.type === "quarter_start") {
      for (const id of onFieldIds) {
        stint.set(id, { startedAt: 0, location: "field" });
      }
      for (const id of currentLineup.bench) {
        stint.set(id, { startedAt: 0, location: "bench" });
      }
    }
    if (ev.type === "swap") {
      const at = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
      if (meta.off_player_id) {
        stint.set(meta.off_player_id, { startedAt: at, location: "bench" });
      }
      if (meta.on_player_id) {
        stint.set(meta.on_player_id, { startedAt: at, location: "field" });
      }
    }
  }

  // Longest on-field stint (excluding vest wearers).
  let off: { playerId: string; msOnField: number; zone: LeagueZone } | null
    = null;
  const zoneOf = (id: string): LeagueZone =>
    currentLineup.forwards.includes(id) ? "forward" : "back";
  for (const id of onFieldIds) {
    if (excludeSet.has(id)) continue;
    const s = stint.get(id);
    const startedAt = s?.startedAt ?? 0;
    const ms = Math.max(0, elapsedMs - startedAt);
    if (!off || ms > off.msOnField) {
      off = { playerId: id, msOnField: ms, zone: zoneOf(id) };
    }
  }
  if (!off) return null;

  // On-pick: prefer the bench player whose chip matches the
  // off-player's vacated zone (so a Forward comes off → another
  // Forward comes on). Soft preference — if no chip-matched bench
  // player is available (e.g. nobody is chipped, or only unchipped
  // / opposite-chip players sit), fall back to the overall longest-
  // on-bench. Within the matched pool, still pick the longest-on-
  // bench so fairness ranking holds.
  const targetChip = off.zone === "forward" ? "a" : "b";
  let chipMatchedOn: { playerId: string; msOnBench: number } | null = null;
  let anyOn: { playerId: string; msOnBench: number } | null = null;
  for (const id of currentLineup.bench) {
    const s = stint.get(id);
    const startedAt = s?.startedAt ?? 0;
    const ms = Math.max(0, elapsedMs - startedAt);
    if (!anyOn || ms > anyOn.msOnBench) {
      anyOn = { playerId: id, msOnBench: ms };
    }
    if (chipByPlayerId?.get(id) === targetChip) {
      if (!chipMatchedOn || ms > chipMatchedOn.msOnBench) {
        chipMatchedOn = { playerId: id, msOnBench: ms };
      }
    }
  }
  const on = chipMatchedOn ?? anyOn;
  if (!on) return null;

  return { off: { playerId: off.playerId, msOnField: off.msOnField }, on, zone: off.zone };
}
