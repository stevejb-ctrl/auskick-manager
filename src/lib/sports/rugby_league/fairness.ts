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
  /**
   * SUB-01/B4 (plan 10-02): per-player ABSOLUTE game-elapsed ms at which
   * they MOST RECENTLY went bench->field (a `swap` on_player_id, or a
   * `lineup_set` that brought an off player on). PERSISTS across period
   * boundaries — unlike the per-quarter stint the suggester rebuilds. The
   * frame is `completedQuarterMs + elapsed_ms`. Mirrors AFL `GameState`
   * and is reused by F3 (Phase 12 long-press "time since last sub").
   */
  lastSubbedOnMs: Record<string, number>;
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
    lastSubbedOnMs: {},
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

  // SUB-01/B4: absolute game-elapsed timeline for lastSubbedOnMs.
  // `elapsed_ms` is per-quarter, so accumulate each completed quarter's
  // duration and add it to the quarter-local value. Mirrors AFL replay:
  // a break lineup_set re-listing the same on-field players leaves their
  // stamp untouched (prevOnField is recomputed fresh from state.lineup
  // at each lineup_set), only a genuine bench->field transition restamps.
  let completedQuarterMs = 0;

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
          // prevOnField from the CURRENT lineup (reflects prior swaps);
          // any player on field in the new lineup who was not on before
          // is a bench->field transition.
          const prevOnField = new Set<string>(
            state.lineup ? leagueOnField(state.lineup) : [],
          );
          state.lineup = normalizeLeagueLineup(meta.lineup);
          const at = completedQuarterMs + (meta.elapsed_ms ?? 0);
          for (const id of leagueOnField(state.lineup)) {
            if (!prevOnField.has(id)) state.lastSubbedOnMs[id] = at;
          }
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
        // B4 recency: a mid-quarter sub-on is a bench->field transition;
        // stamp the absolute frame so it survives the period boundary.
        state.lastSubbedOnMs[on] = completedQuarterMs + (meta.elapsed_ms ?? 0);
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
        // B4 recency: roll this quarter's duration into the absolute
        // timeline so next-quarter transitions stamp an absolute value.
        completedQuarterMs += meta.elapsed_ms ?? 0;
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
        // Injury is a FLAG only — no lineup mutation. The on-field
        // player stays in their forwards/backs slot and renders with
        // an INJ badge (driven by `injuredIds` derived from events in
        // the orchestrator). The physical field→bench move comes from
        // the `swap` event that fires alongside the injury event when
        // a replacement is picked — just like AFL's
        // `handleInjuryReplacement` which enqueues `markInjury` +
        // `recordSwap` in sequence.
        //
        // This also fixes the "vacant slot in wrong position" bug:
        // because the player stays in their forwards/backs array at
        // their original index, the formation arranger keeps their
        // slot in place. Once the swap fires, the replacement takes
        // the exact same array index → exact same visual slot.
        //
        // Prior implementation called `removeFromLineup` which
        // removed the player from ALL three buckets — they vanished
        // from the UI entirely and the vacant slot appeared at the
        // END of the zone row rather than the player's position.
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

      case "roster_shrink": {
        // Mid-game on-field count reduction driven by the coach
        // tapping "Players on field" → decreasing the number in
        // Game Settings. Each player in `remove_player_ids` is
        // moved from forwards/backs to bench — mirrors AFL's
        // `roster_shrink` semantics. The games.on_field_size row
        // is updated by the same server action that wrote this
        // event; the RL field UI re-renders empty slots to match
        // the new cap on the next router.refresh().
        if (!state.lineup) break;
        const shrinkMeta = meta as { remove_player_ids?: string[] };
        const removeIds = shrinkMeta.remove_player_ids ?? [];
        if (removeIds.length === 0) break;
        let fwd = state.lineup.forwards.slice();
        let bks = state.lineup.backs.slice();
        const bnch = state.lineup.bench.slice();
        for (const pid of removeIds) {
          fwd = fwd.filter((p) => p !== pid);
          bks = bks.filter((p) => p !== pid);
          if (!bnch.includes(pid)) bnch.push(pid);
        }
        state.lineup = { forwards: fwd, backs: bks, bench: bnch };
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

// ─── Unbroken-period compliance (Junior Laws §6 + §7) ────────
// "Each player in the team is to play a MINIMUM of ONE UNBROKEN
// HALF of a match (i.e. twenty (20) minutes)." For U6–U9 that's
// 2 unbroken quarters of 8 min; for U10–U12 it's 1 unbroken half
// of 20 min. "Unbroken" = continuously on the field from period
// kickoff to period hooter, no swaps off.
//
// A player is unbroken for a period IF:
//   1. They were on the field at `quarter_start` for that period.
//   2. They weren't subbed off via a normal `swap` (off side),
//      and weren't `player_loan`-ed during the period.
//   3. Any injury they suffered was resolved within the §7
//      carve-out — see below.
//
// §7 carve-out: an injury is resolved by a subsequent `injury`
// event with `injured: false` (the "mark recovered" affordance
// in the LockModal). If the gap between the two events is ≤ 3
// minutes of playing time, the original player keeps their
// unbroken-period stamp. If the gap exceeds 3 minutes — or no
// return event ever fires before `quarter_end` — the player is
// considered broken.
//
// Implementation:
//   * Each period tracker carries `pendingInjury: Map<pid, ms>`
//     keyed by player id, value = elapsed_ms when the injury
//     started.
//   * An `injury` event with `injured: true` opens an incident.
//   * An `injury` event with `injured: false` closes it; if the
//     duration > 180_000 ms it adds the player to `removed`.
//   * `quarter_end` finalises any incidents that didn't close
//     by adding the player to `removed` (they never returned).
//
// Two assumptions:
//   * Boundary inclusive — the law says "up to three minutes",
//     so a 180_000 ms duration still counts as unbroken.
//   * The §7 carve-out only protects the INJURED player. The
//     replacement (whoever was swapped on to fill in) gets no
//     special treatment — they're tracked by their own swap-on
//     event and follow the standard rule for THEIR period
//     stint. The laws' "credited with continuous playing time"
//     language is interpreted as a stats-tracking note, not a
//     §6 boost for the temp player.

/** §7 carve-out threshold — three minutes of playing time. */
const INJURY_CARVEOUT_MS = 3 * 60 * 1000;

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
  // quarter_start; removed = set of players whose period stint was
  // broken (swap off, loan, injury that exceeded the §7 carve-out,
  // or injury that never closed before quarter_end). pendingInjury
  // tracks in-flight injuries keyed by player id → elapsed_ms when
  // the injury started, so the closing event can compute the gap.
  type PeriodTracker = {
    starters: Set<string>;
    removed: Set<string>;
    pendingInjury: Map<string, number>;
  };
  const periods = new Map<number, PeriodTracker>();

  // Tracks the current on-field set so a quarter_start can
  // snapshot it. Updated by lineup_set, swap, and injury events.
  let currentField = new Set<string>();
  let currentPeriod: number | null = null;
  const allPlayers = new Set<string>();

  for (const ev of sorted) {
    const meta = ev.metadata as {
      lineup?: Partial<LeagueLineup>;
      quarter?: number;
      elapsed_ms?: number;
      off_player_id?: string;
      on_player_id?: string;
      injured?: boolean;
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
          pendingInjury: new Map(),
        });
        break;
      }
      case "quarter_end": {
        // Any injuries still open at the hooter → the player never
        // returned, so they're broken for this period regardless of
        // duration.
        if (currentPeriod !== null) {
          const tracker = periods.get(currentPeriod);
          if (tracker) {
            tracker.pendingInjury.forEach((_startedAt, pid) => {
              tracker.removed.add(pid);
            });
            tracker.pendingInjury.clear();
          }
        }
        currentPeriod = null;
        break;
      }
      case "swap": {
        const off = meta.off_player_id;
        const on = meta.on_player_id;
        // Swap-off is unconditionally a break for the off-player
        // (no §7 carve-out — that's injury-only). Done BEFORE
        // mutating currentField so a stale-state swap with an
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
      case "injury": {
        const pid = ev.player_id;
        if (!pid) break;
        allPlayers.add(pid);
        // injured: true (default when missing) opens an incident.
        // injured: false closes it; the gap decides §7.
        const isInjured = meta.injured !== false;
        const elapsed
          = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
        const tracker
          = currentPeriod !== null ? periods.get(currentPeriod) : null;
        if (isInjured) {
          if (currentField.has(pid)) {
            currentField.delete(pid);
            // Don't add to `removed` yet — wait to see if they
            // return within the §7 window. If currentPeriod is
            // null (between quarters), this still removes them
            // from the field but no tracker exists to record the
            // pending incident — they're effectively just absent.
            if (tracker) tracker.pendingInjury.set(pid, elapsed);
          }
        } else if (tracker?.pendingInjury.has(pid)) {
          const startedAt = tracker.pendingInjury.get(pid) as number;
          tracker.pendingInjury.delete(pid);
          const duration = elapsed - startedAt;
          if (duration > INJURY_CARVEOUT_MS) {
            tracker.removed.add(pid);
          }
          currentField.add(pid);
        } else {
          // "Recovered" event without a matching open incident —
          // most likely the injury happened pre-game or between
          // periods. Re-add to field so subsequent quarter_starts
          // see them.
          currentField.add(pid);
        }
        break;
      }
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
  /**
   * Current playing-time elapsed_ms in the active period (the
   * value `LeagueLiveGame` ticks via wall-clock). Used to flip an
   * in-flight injury from "still on track" to "broken" the moment
   * the absence exceeds the §7 carve-out. Defaults to 0 — meaning
   * an in-flight injury is treated as still-within-carve-out
   * until the closing event lands or quarter_end fires.
   */
  currentElapsedMs: number = 0,
): Record<string, UnbrokenPeriodLiveStatus> {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  type PeriodTracker = {
    starters: Set<string>;
    removed: Set<string>;
    pendingInjury: Map<string, number>;
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
      elapsed_ms?: number;
      off_player_id?: string;
      on_player_id?: string;
      injured?: boolean;
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
          pendingInjury: new Map(),
          closed: false,
        });
        break;
      }
      case "quarter_end": {
        if (currentPeriod !== null) {
          const t = periods.get(currentPeriod);
          if (t) {
            t.pendingInjury.forEach((_startedAt, pid) => {
              t.removed.add(pid);
            });
            t.pendingInjury.clear();
            t.closed = true;
          }
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
      case "injury": {
        const pid = ev.player_id;
        if (!pid) break;
        allPlayers.add(pid);
        const isInjured = meta.injured !== false;
        const elapsed
          = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
        const tracker
          = currentPeriod !== null ? periods.get(currentPeriod) : null;
        if (isInjured) {
          if (currentField.has(pid)) {
            currentField.delete(pid);
            if (tracker) tracker.pendingInjury.set(pid, elapsed);
          }
        } else if (tracker?.pendingInjury.has(pid)) {
          const startedAt = tracker.pendingInjury.get(pid) as number;
          tracker.pendingInjury.delete(pid);
          const duration = elapsed - startedAt;
          if (duration > INJURY_CARVEOUT_MS) {
            tracker.removed.add(pid);
          }
          currentField.add(pid);
        } else {
          currentField.add(pid);
        }
        break;
      }
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

  // Live-side §7 enforcement on the open period: if an injury is
  // still pending and the current playing-time elapsed exceeds the
  // carve-out, the player is already broken — surface that ahead
  // of the closing event so the warning panel doesn't lull the
  // coach into thinking they're still on track.
  if (currentPeriod !== null) {
    const tracker = periods.get(currentPeriod);
    if (tracker) {
      tracker.pendingInjury.forEach((startedAt, pid) => {
        if (currentElapsedMs - startedAt > INJURY_CARVEOUT_MS) {
          tracker.removed.add(pid);
        }
      });
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
  /**
   * Total ms on field across the season's prior games. Sums
   * `playerMsOnField` per game.
   */
  msPlayed: number;
  /**
   * Total game-ms available to this player across attended games.
   * For each game they showed up to, we add the FULL playing time
   * of that game (sum of `quarter_end.elapsed_ms` over its periods).
   *
   * Why "attended → credit full game": a player who turned up gets
   * the same denominator regardless of how the coach chose to
   * rotate them. That means a kid who showed up for 3 games and was
   * benched the whole time has ratio 0 (high priority) — they
   * deserve a go. A kid who showed up to 10 games and played most
   * of them naturally has a higher denominator.
   *
   * Players who didn't attend a game add nothing to BOTH numerator
   * and denominator for that game — so an absentee's ratio reflects
   * only the games they were present for. This is what makes the
   * fairness ratio "proportionate" rather than "gross".
   */
  msAvailable: number;
  /**
   * Number of prior games where this player was on the field at any
   * point (lineup_set field set OR swapped on mid-game). Used as
   * the denominator for the FR / DH ratios — vest fairness is
   * measured against how often you were eligible for a vest, not
   * how many games you turned up to bench-only.
   */
  onFieldAppearances: number;
}

/**
 * Per-player season vest-wearing totals. Used by the lineup picker
 * to surface "FR 3 · DH 1" under each candidate so the coach can
 * see at a glance who's had more / fewer vest stints across the
 * season before manually overriding the suggester. Built from the
 * SAME event log + game-grouping the suggester uses, so the
 * numbers always match what the auto-pick was trying to balance.
 *
 * Steve 2026-05-19: exposed publicly because the existing
 * `computeSeasonFairness` lookup is module-private (used only by
 * the suggester).
 */
export interface SeasonVestCount {
  fr: number;
  dh: number;
}

export function seasonVestCountsByPlayer(
  seasonEvents: GameEvent[],
): Record<string, SeasonVestCount> {
  const out: Record<string, SeasonVestCount> = {};
  for (const ev of seasonEvents) {
    if (ev.type !== "vest_assigned" || !ev.player_id) continue;
    const meta = ev.metadata as { vest?: string };
    if (meta.vest !== "fr" && meta.vest !== "dh") continue;
    out[ev.player_id] ??= { fr: 0, dh: 0 };
    if (meta.vest === "fr") out[ev.player_id].fr += 1;
    else out[ev.player_id].dh += 1;
  }
  return out;
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
        msPlayed: 0,
        msAvailable: 0,
        onFieldAppearances: 0,
      };
      out.set(id, row);
    }
    return row;
  };

  byGame.forEach((gameEvents) => {
    const compliance = unbrokenPeriodCompliance(gameEvents, required);

    // Game-ms available = sum of every `quarter_end` elapsed_ms.
    // Periods that never closed (game still in progress, or events
    // got lost) contribute zero. Computed once per game and added
    // to every attending player's denominator.
    let gameMsAvailable = 0;
    for (const ev of gameEvents) {
      if (ev.type !== "quarter_end") continue;
      const meta = ev.metadata as { elapsed_ms?: number };
      if (typeof meta.elapsed_ms === "number") {
        gameMsAvailable += meta.elapsed_ms;
      }
    }

    // Per-player ms on field for this game. Pass 0/0 for the live-
    // stint extension so only CLOSED stints count — for a finished
    // game the function closes all stints at quarter_end so the
    // result is the full total.
    const msByPlayer = playerMsOnField(gameEvents, 0, 0);

    // Track who hit the field at any point this game (lineup_set
    // field set or swap-on). Drives `onFieldAppearances` — the
    // denominator for vest ratios.
    const onFieldThisGame = new Set<string>();
    for (const ev of gameEvents) {
      if (ev.type === "lineup_set") {
        const meta = ev.metadata as { lineup?: Partial<LeagueLineup> };
        if (meta.lineup) {
          const lineup = normalizeLeagueLineup(meta.lineup);
          for (const id of leagueOnField(lineup)) onFieldThisGame.add(id);
        }
      } else if (ev.type === "swap") {
        const meta = ev.metadata as { on_player_id?: string };
        if (meta.on_player_id) onFieldThisGame.add(meta.on_player_id);
      }
    }

    Object.entries(compliance).forEach(([playerId, c]) => {
      const row = slot(playerId);
      row.games++;
      if (!c.compliant) row.shortfall++;
      row.msAvailable += gameMsAvailable;
      row.msPlayed += msByPlayer[playerId] ?? 0;
      if (onFieldThisGame.has(playerId)) row.onFieldAppearances++;
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

// ─── Proportionate fairness ratios ──────────────────────────
// Steve 2026-05-19: gross-count fairness (shortfall + games) gave
// a no-show kid the same "fewer games" priority bump as a kid
// who'd been at every game but quietly underplayed. The new sort
// uses RATIOS — playtime as a share of available time, vests as
// a share of on-field appearances — so a 90%-time kid is always
// at 90% regardless of total minutes. Tiebreak then prefers the
// RELIABLE attendee, not the absentee.

/** msPlayed / msAvailable; 0 when no availability data yet. */
function playtimeRatio(row: SeasonFairnessRow | undefined): number {
  if (!row || row.msAvailable <= 0) return 0;
  return row.msPlayed / row.msAvailable;
}

/** frCount / onFieldAppearances; 0 when no on-field history yet. */
function frRatio(row: SeasonFairnessRow | undefined): number {
  if (!row || row.onFieldAppearances <= 0) return 0;
  return row.frCount / row.onFieldAppearances;
}

/** dhCount / onFieldAppearances; 0 when no on-field history yet. */
function dhRatio(row: SeasonFairnessRow | undefined): number {
  if (!row || row.onFieldAppearances <= 0) return 0;
  return row.dhCount / row.onFieldAppearances;
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

  // Field ranking — proportionate fairness, not gross counts.
  // Steve 2026-05-19: the old "games ASC" tier penalised reliable
  // attendees in favour of no-shows. A kid who's missed half the
  // season looks "lower games" and would jump to the front; the
  // reliable kid at every game would sit behind them. The rule is
  // now:
  //   1. shortfall DESC — §6 enforcement is still primary. Owed
  //      unbroken periods get paid back regardless of attendance.
  //   2. playtime ratio ASC — proportion of available time on
  //      field, NOT gross minutes. A no-show kid playing 100%
  //      of their attended time looks identical to a reliable
  //      kid playing 100%. A 50%-ratio kid jumps ahead of a
  //      90%-ratio kid even when the 90% kid has more total
  //      minutes (because the 90% kid is already getting their
  //      share). Players with no history yet (ratio 0) get high
  //      priority — same as "needs a go".
  //   3. games DESC — reliable attendees first on ties. Once
  //      everyone's caught up, the kid at every week gets the
  //      next go, not the kid who just showed up.
  //   4. jersey ASC — deterministic stable tiebreak.
  const ranked = [...players].sort((a, b) => {
    const fa = fairness.get(a.id);
    const fb = fairness.get(b.id);
    const sa = fa?.shortfall ?? 0;
    const sb = fb?.shortfall ?? 0;
    if (sa !== sb) return sb - sa;
    const ra = playtimeRatio(fa);
    const rb = playtimeRatio(fb);
    if (ra !== rb) return ra - rb;
    const ga = fa?.games ?? 0;
    const gb = fb?.games ?? 0;
    if (ga !== gb) return gb - ga;
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

  // Starter selection is pure fairness — top N by rank go on the
  // field, the rest sit. The chip decides ZONE among starters but
  // doesn't decide WHO starts. Earlier draft ran two passes
  // (chipped first, unchipped after) which let a lower-ranked
  // chipped player take a slot off a higher-ranked unchipped
  // player — penalising the chip-less. Steve 2026-05-19.
  //
  //   Pass 1: walk starters (top-N fairness); place each into
  //           their preferred zone when chipped and the zone has
  //           room. Anyone unplaced (unchipped or chip-overflow)
  //           parks for pass 2.
  //   Pass 2: fill any unplaced starter into whichever zone has
  //           room. Forwards first (the target capacity guarantees
  //           every starter lands somewhere).
  //
  // Bench is just the tail of the fairness rank — players past
  // the on-field cut.
  const starters = ranked.slice(0, defaultOnFieldSize);
  const benchTail = ranked.slice(defaultOnFieldSize);
  const forwards: string[] = [];
  const backs: string[] = [];
  const unplaced: typeof starters = [];

  for (const p of starters) {
    const zone = chipZone(p.chip);
    if (zone === "forward" && forwards.length < targetForwards) {
      forwards.push(p.id);
    } else if (zone === "back" && backs.length < targetBacks) {
      backs.push(p.id);
    } else {
      // Either unchipped or chip-overflow (their preferred zone
      // is already full). Defer until chipped starters have all
      // had a shot at their natural fit.
      unplaced.push(p);
    }
  }

  for (const p of unplaced) {
    if (forwards.length < targetForwards) {
      forwards.push(p.id);
    } else if (backs.length < targetBacks) {
      backs.push(p.id);
    }
    // No `else { bench.push }` path — starters.length always
    // equals targetForwards + targetBacks so the loop always
    // places every unplaced starter.
  }

  const fieldPicks = [...forwards, ...backs];
  const bench = benchTail.map((p) => p.id);

  // Vest suggestions — proportionate, with a "give everyone a go"
  // first-tier (Steve 2026-05-19):
  //   1. Zero-count first — players who have NEVER worn this vest
  //      get priority while anyone in the pool is still at 0.
  //      Implements "everyone gets a go over the year".
  //   2. Vest ratio ASC — vestCount / onFieldAppearances. Lower
  //      share of vest-history per chance = next go.
  //   3. games DESC — reliable attendees first on ties.
  //   4. jersey ASC — stable tiebreak.
  // FR / DH stay mutually exclusive per period.
  let suggestedFr: string | null = null;
  let suggestedDh: string | null = null;

  const jerseyOf = (id: string) =>
    players.find((p) => p.id === id)?.jersey_number ?? Number.MAX_SAFE_INTEGER;
  const compareVest = (
    a: string,
    b: string,
    countFor: (row: SeasonFairnessRow | undefined) => number,
    ratioFor: (row: SeasonFairnessRow | undefined) => number,
  ) => {
    const fa = fairness.get(a);
    const fb = fairness.get(b);
    const ca = countFor(fa);
    const cb = countFor(fb);
    const za = ca === 0 ? 0 : 1;
    const zb = cb === 0 ? 0 : 1;
    if (za !== zb) return za - zb;
    const ra = ratioFor(fa);
    const rb = ratioFor(fb);
    if (ra !== rb) return ra - rb;
    const ga = fa?.games ?? 0;
    const gb = fb?.games ?? 0;
    if (ga !== gb) return gb - ga;
    return jerseyOf(a) - jerseyOf(b);
  };

  if (vestRequirements?.fr) {
    const frRanked = [...fieldPicks].sort((a, b) =>
      compareVest(a, b, (r) => r?.frCount ?? 0, frRatio),
    );
    suggestedFr = frRanked[0] ?? null;
  }
  if (vestRequirements?.dh) {
    const dhPool = fieldPicks.filter((id) => id !== suggestedFr);
    const dhRanked = [...dhPool].sort((a, b) =>
      compareVest(a, b, (r) => r?.dhCount ?? 0, dhRatio),
    );
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

  // Vest rank tiers (Steve 2026-05-19):
  //   1. Zero-count first — anyone who's never worn THIS vest gets
  //      priority while any zero-count candidate remains.
  //   2. Vest ratio ASC — vestCount / onFieldAppearances. The
  //      reliable kid at every game wearing FR once-per-5-games
  //      (20%) gets next pick over the once-only kid at 50%.
  //   3. games DESC — reliable attendees first on ties.
  //   4. jersey ASC — stable tiebreak.
  const rank = (
    pool: string[],
    countFor: (row: SeasonFairnessRow | undefined) => number,
    ratioFor: (row: SeasonFairnessRow | undefined) => number,
  ) =>
    [...pool].sort((a, b) => {
      const fa = fairness.get(a);
      const fb = fairness.get(b);
      const ca = countFor(fa);
      const cb = countFor(fb);
      const za = ca === 0 ? 0 : 1;
      const zb = cb === 0 ? 0 : 1;
      if (za !== zb) return za - zb;
      const ra = ratioFor(fa);
      const rb = ratioFor(fb);
      if (ra !== rb) return ra - rb;
      const ga = fa?.games ?? 0;
      const gb = fb?.games ?? 0;
      if (ga !== gb) return gb - ga;
      return jerseyOf(a) - jerseyOf(b);
    });

  const fr: (string | null)[] = [];
  const dh: (string | null)[] = [];
  // Single combined "has worn any vest this game" set. Earlier
  // draft used separate `usedFr` / `usedDh` sets — allowed the
  // same player to wear FR in one half and DH in another. Steve
  // 2026-05-19: rule clarified to "once a player has worn any
  // vest, they're excluded from any vest in any later period".
  // The combined set enforces that automatically.
  const usedAnyVest = new Set<string>();

  for (let p = 0; p < periodCount; p++) {
    let frPick: string | null = null;
    let dhPick: string | null = null;
    if (vestRequirements?.fr) {
      const pool = onFieldIds.filter((id) => !usedAnyVest.has(id));
      const ranked = rank(pool, (row) => row?.frCount ?? 0, frRatio);
      frPick = ranked[0] ?? null;
      if (frPick) usedAnyVest.add(frPick);
    }
    if (vestRequirements?.dh) {
      const pool = onFieldIds.filter(
        (id) => !usedAnyVest.has(id) && id !== frPick,
      );
      const ranked = rank(pool, (row) => row?.dhCount ?? 0, dhRatio);
      dhPick = ranked[0] ?? null;
      if (dhPick) usedAnyVest.add(dhPick);
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

// ─── Per-period on-field ms (F3 / D-05, plan 12-02) ───────────
// The long-press player insight needs on-field ms split BY PERIOD. RL
// has a single config zone ("field"), so this buckets the SAME stint
// ms `playerMsOnField` sums whole-game by the quarter the stint closed
// in, under the single "field" key. Only CLOSED stints (completed
// periods) are credited — the live trailing period is overlaid by the
// caller, mirroring AFL's replay snapshot. Summing a player's
// per-period buckets equals their `playerMsOnField` total for a
// settled game with no open live stint. Shape mirrors AFL's
// `GameState.playedZoneMsByPeriod`.
export function playedZoneMsByPeriod(
  events: GameEvent[],
): Record<string, Record<number, Record<string, number>>> {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const out: Record<string, Record<number, Record<string, number>>> = {};
  const stintStart: Record<string, number> = {};
  let activeQuarter: number | null = null;
  let snapshot: LeagueLineup | null = null;

  const closeStint = (playerId: string, endElapsed: number) => {
    const start = stintStart[playerId];
    if (start === undefined) return;
    const ms = Math.max(0, endElapsed - start);
    if (activeQuarter != null && ms > 0) {
      out[playerId] ??= {};
      out[playerId][activeQuarter] ??= {};
      out[playerId][activeQuarter]["field"] =
        (out[playerId][activeQuarter]["field"] ?? 0) + ms;
    }
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
        if (meta.lineup) snapshot = normalizeLeagueLineup(meta.lineup);
        break;
      }
      case "quarter_start": {
        // Close any leftover open stints from a missing quarter_end.
        for (const id of Object.keys(stintStart)) closeStint(id, 0);
        activeQuarter =
          typeof meta.quarter === "number"
            ? meta.quarter
            : (activeQuarter ?? 0) + 1;
        if (snapshot) {
          for (const id of leagueOnField(snapshot)) stintStart[id] = 0;
        }
        break;
      }
      case "quarter_end": {
        const endElapsed =
          typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
        for (const id of Object.keys(stintStart)) closeStint(id, endElapsed);
        activeQuarter = null;
        break;
      }
      case "swap": {
        const at = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
        if (meta.off_player_id) closeStint(meta.off_player_id, at);
        if (meta.on_player_id && stintStart[meta.on_player_id] === undefined) {
          stintStart[meta.on_player_id] = at;
        }
        // Mirror the swap into snapshot so a later quarter_start seeds
        // the right field set (same rule as playerMsOnField).
        if (snapshot && meta.off_player_id && meta.on_player_id) {
          const off = meta.off_player_id;
          const on = meta.on_player_id;
          let forwards: string[] = snapshot.forwards.slice();
          let backs: string[] = snapshot.backs.slice();
          const bench: string[] = snapshot.bench.slice();
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
        // Position changes don't break stints; mirror into snapshot.
        if (snapshot && ev.player_id) {
          const pid = ev.player_id;
          const toZone = (meta as { to_zone?: LeagueZone }).to_zone;
          if (toZone === "forward" || toZone === "back") {
            const wasOnField =
              snapshot.forwards.includes(pid) || snapshot.backs.includes(pid);
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

  return out;
}

// ─── Per-player zone-time accounting (forwards / centre / backs) ──
// Optional F/C/B time accumulator for the AFL-style stacked bar that
// renders on every LeaguePlayerTile when the team / game has
// track_zone_time on.
//
// RL has no native "centre" zone — the field splits into forwards
// and backs only — so the bar maps:
//   * Time in `forwards` zone (not wearing a vest)  → forwards
//   * Time in `backs` zone (not wearing a vest)     → backs
//   * Time wearing the FR or DH vest (any zone)     → centre
//
// Vest semantics:
//   * Each `vest_assigned` event names the period the vest applies to
//     (metadata.period) and whether it's a normal assignment or a
//     mid-period replacement (metadata.replacement). Vests do NOT
//     survive across periods — every quarter_start resets to that
//     period's plan.
//   * Replacement events are rare (only fired on injury). For v1 the
//     latest-by-created_at vest_assigned per (period, vest) defines
//     the wearer for the whole period — slight under-credit for the
//     original wearer of a replacement is acceptable noise.
//   * Vests are accounted strictly while the player is on field.
//
// Output shape mirrors AFL's `ZoneMinutes` so the tile bar code can be
// near-identical. Values are in milliseconds despite the legacy name.

export interface LeagueZoneMs {
  forwards: number;
  centre: number;
  backs: number;
}

export function playerZoneMsOnField(
  events: GameEvent[],
  currentQuarter: number,
  currentElapsedMs: number,
): Record<string, LeagueZoneMs> {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const total: Record<string, LeagueZoneMs> = {};
  const addMs = (pid: string, bucket: keyof LeagueZoneMs, ms: number) => {
    if (ms <= 0) return;
    const row = total[pid] ?? { forwards: 0, centre: 0, backs: 0 };
    row[bucket] += ms;
    total[pid] = row;
  };

  // Pre-walk to resolve the INITIAL wearer for each (period, vest) —
  // last non-replacement event wins (matches how the planning UI lets
  // a coach revise the plan up until kickoff). Replacement events are
  // ignored here and handled inline during the main walk so the
  // hand-off happens at the replacement's elapsed_ms.
  const vestPlanByPeriod = new Map<
    number,
    { fr: string | null; dh: string | null }
  >();
  for (const ev of sorted) {
    if (ev.type !== "vest_assigned") continue;
    const meta = (ev.metadata ?? {}) as {
      vest?: "fr" | "dh";
      period?: number;
      replacement?: boolean;
    };
    if (meta.replacement === true) continue;
    if (typeof meta.period !== "number") continue;
    if (meta.vest !== "fr" && meta.vest !== "dh") continue;
    const row = vestPlanByPeriod.get(meta.period) ?? { fr: null, dh: null };
    if (meta.vest === "fr") row.fr = ev.player_id ?? null;
    else row.dh = ev.player_id ?? null;
    vestPlanByPeriod.set(meta.period, row);
  }

  // Open-stint state. `zone` is "forward" | "back"; `vest` true when
  // the player is currently wearing FR or DH. Players not in the map
  // are currently off-field.
  type Stint = {
    startMs: number;
    zone: "forward" | "back";
    vest: boolean;
  };
  const openStint: Record<string, Stint> = {};
  let activeQuarter: number | null = null;
  let vestWearer: { fr: string | null; dh: string | null } = {
    fr: null,
    dh: null,
  };
  // Snapshot of the current lineup so we can compute zones for both
  // quarter_start (seed all on-field players' stints) and swap (give
  // the on-player the off-player's vacated zone).
  let snapshot: LeagueLineup | null = null;

  const closeStint = (pid: string, endMs: number) => {
    const s = openStint[pid];
    if (!s) return;
    const dur = Math.max(0, endMs - s.startMs);
    if (s.vest) addMs(pid, "centre", dur);
    else if (s.zone === "forward") addMs(pid, "forwards", dur);
    else addMs(pid, "backs", dur);
    delete openStint[pid];
  };

  const zoneOfPid = (pid: string): "forward" | "back" => {
    if (snapshot) {
      if (snapshot.backs.includes(pid)) return "back";
      if (snapshot.forwards.includes(pid)) return "forward";
    }
    return "forward";
  };

  for (const ev of sorted) {
    const meta = (ev.metadata ?? {}) as {
      lineup?: Partial<LeagueLineup>;
      quarter?: number;
      period?: number;
      elapsed_ms?: number;
      off_player_id?: string;
      on_player_id?: string;
      to_zone?: LeagueZone;
      vest?: "fr" | "dh";
      replacement?: boolean;
    };
    switch (ev.type) {
      case "lineup_set": {
        if (meta.lineup) snapshot = normalizeLeagueLineup(meta.lineup);
        break;
      }
      case "quarter_start": {
        // Defensive: close any open stints (should be empty after a
        // clean quarter_end).
        for (const pid of Object.keys(openStint)) closeStint(pid, 0);
        activeQuarter
          = typeof meta.quarter === "number"
            ? meta.quarter
            : (activeQuarter ?? 0) + 1;
        vestWearer = vestPlanByPeriod.get(activeQuarter ?? 0) ?? {
          fr: null,
          dh: null,
        };
        if (snapshot) {
          for (const pid of leagueOnField(snapshot)) {
            const zone = zoneOfPid(pid);
            const vest = pid === vestWearer.fr || pid === vestWearer.dh;
            openStint[pid] = { startMs: 0, zone, vest };
          }
        }
        break;
      }
      case "quarter_end": {
        const endMs
          = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
        for (const pid of Object.keys(openStint)) closeStint(pid, endMs);
        activeQuarter = null;
        break;
      }
      case "swap": {
        const at = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
        const off = meta.off_player_id;
        const on = meta.on_player_id;
        // Determine the off-player's zone BEFORE mutating the snapshot
        // so the on-player inherits the vacated slot.
        let offZone: "forward" | "back" = "forward";
        if (off) {
          offZone = zoneOfPid(off);
          closeStint(off, at);
        }
        // Mirror the swap into snapshot (same rules as playerMsOnField).
        if (snapshot && off && on) {
          let forwards: string[] = snapshot.forwards.slice();
          let backs: string[] = snapshot.backs.slice();
          let bench: string[] = snapshot.bench.slice();
          const fIdx = forwards.indexOf(off);
          const bIdx = backs.indexOf(off);
          if (bIdx >= 0) backs.splice(bIdx, 1);
          else if (fIdx >= 0) forwards.splice(fIdx, 1);
          if (!bench.includes(off)) bench.push(off);
          const benchIdx = bench.indexOf(on);
          if (benchIdx >= 0) bench.splice(benchIdx, 1);
          forwards = forwards.filter((id) => id !== on);
          backs = backs.filter((id) => id !== on);
          if (offZone === "back") backs.push(on);
          else forwards.push(on);
          snapshot = { forwards, backs, bench };
        }
        if (on && openStint[on] === undefined) {
          const vest = on === vestWearer.fr || on === vestWearer.dh;
          openStint[on] = { startMs: at, zone: offZone, vest };
        }
        break;
      }
      case "league_position_change": {
        // In-zone move (forward ↔ back) without leaving the field.
        // Split the stint: close at this elapsed_ms in the OLD zone,
        // reopen at the same instant in the NEW zone. Vest carries
        // through.
        const pid = ev.player_id;
        const toZone = meta.to_zone;
        if (!pid || (toZone !== "forward" && toZone !== "back")) break;
        const at = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
        const prior = openStint[pid];
        if (prior) {
          closeStint(pid, at);
          openStint[pid] = { startMs: at, zone: toZone, vest: prior.vest };
        }
        // Mirror into snapshot.
        if (snapshot) {
          const wasOnField
            = snapshot.forwards.includes(pid) || snapshot.backs.includes(pid);
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
        break;
      }
      case "vest_assigned": {
        // Replacements take effect mid-period. Non-replacements are
        // already applied at the quarter_start for their period and
        // are no-ops here. The pre-walk built vestPlanByPeriod with
        // latest-wins so replacements still claim the rest of the
        // period.
        //
        // Without an elapsed_ms in the metadata we use 0 as a
        // last-resort start (negligible since the period would not
        // yet have ticked far). When we have a current-period swap
        // / quarter_start before this event the simpler approach is
        // to switch wearers now and let the next event close the
        // stint at its own elapsed_ms.
        if (meta.replacement !== true) break;
        if (typeof meta.period !== "number" || meta.period !== activeQuarter) {
          break;
        }
        const newWearer = ev.player_id;
        const vestKind = meta.vest;
        if (!newWearer || (vestKind !== "fr" && vestKind !== "dh")) break;
        const oldWearer = vestWearer[vestKind];
        // Determine "now" — best signal is the elapsed_ms of the
        // event itself if present (replacement modal records it),
        // otherwise fall back to the live elapsed.
        const at
          = typeof meta.elapsed_ms === "number"
            ? meta.elapsed_ms
            : activeQuarter === currentQuarter
              ? currentElapsedMs
              : 0;
        // Hand-off: close the old wearer's vest stint (if any),
        // reopen as non-vest in their zone. They might also be the
        // one going off (injury) — in that case there's no open
        // stint to reopen.
        if (oldWearer && openStint[oldWearer]) {
          closeStint(oldWearer, at);
          // Re-open in their current zone, no vest, IF they're
          // still on field (a non-replacement injury would close
          // the stint separately via an `injury` event).
          if (snapshot && leagueOnField(snapshot).includes(oldWearer)) {
            openStint[oldWearer] = {
              startMs: at,
              zone: zoneOfPid(oldWearer),
              vest: false,
            };
          }
        }
        // Open the new wearer's vest stint.
        if (openStint[newWearer]) {
          closeStint(newWearer, at);
        }
        if (snapshot && leagueOnField(snapshot).includes(newWearer)) {
          openStint[newWearer] = {
            startMs: at,
            zone: zoneOfPid(newWearer),
            vest: true,
          };
        }
        vestWearer = { ...vestWearer, [vestKind]: newWearer };
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

  // Live: extend any open stints in the active period to currentElapsedMs.
  if (activeQuarter === currentQuarter) {
    for (const pid of Object.keys(openStint)) {
      const s = openStint[pid];
      const dur = Math.max(0, currentElapsedMs - s.startMs);
      if (dur <= 0) continue;
      if (s.vest) addMs(pid, "centre", dur);
      else if (s.zone === "forward") addMs(pid, "forwards", dur);
      else addMs(pid, "backs", dur);
    }
  }

  return total;
}

// ─── Whole-bench rotation suggestion ──────────────────────────
// Surfaces the next-due rotation set during live play — one swap
// per bench player so the coach can rotate the WHOLE bench in
// one tap (same UX AFL and netball ship). Earlier draft suggested
// one swap at a time which led to the bench cycling through
// piecemeal; aligning to AFL means rotating everyone who's been
// sitting out at once.
//
// Inputs:
//   * The full event log so we can walk stint history.
//   * The current period.
//   * The current lineup ({ forwards, backs, bench }).
//   * Players who CANNOT come off this period (FR / DH wearers —
//     they keep the vest the whole period unless replaced via the
//     forced injury-replacement modal).
//   * Current period-elapsed ms.
//   * Optional per-player chip lookup. When supplied, each bench
//     pairing prefers a same-zone (forward / back) match so the
//     forward-back ratio stays stable across rotations.
//
// Pairing rule per bench player (longest-on-bench first):
//   1. Find a same-zone (chip-matched) field player who's been on
//      the longest among the still-on-field, non-excluded set.
//   2. If no chip-matched candidate, fall back to whoever's been on
//      the longest in any zone.
//   3. Mark that field player as "going off this round" so the
//      next bench player picks a different off-target.
//   4. Mark the bench player as "going on this round" so they
//      don't get re-paired.
//
// Output: ordered array of suggestions (bench order = longest-on-
// bench first). Empty when there's nothing to suggest (no bench,
// everyone on-field excluded, period inactive).

export interface LeagueSubSuggestion {
  off: { playerId: string; msOnField: number };
  on: { playerId: string; msOnBench: number };
  /** Zone the off-player vacated — the on-player joins this zone. */
  zone: LeagueZone;
}

export function suggestLeagueSubs(
  events: GameEvent[],
  currentQuarter: number,
  currentLineup: LeagueLineup,
  excludeOffPlayers: readonly string[],
  elapsedMs: number,
  chipByPlayerId?: ReadonlyMap<string, import("@/lib/types").PlayerChip | null>,
): LeagueSubSuggestion[] {
  const onFieldIds = leagueOnField(currentLineup);
  if (onFieldIds.length === 0 || currentLineup.bench.length === 0) {
    return [];
  }
  const excludeSet = new Set(excludeOffPlayers);
  type Stint = { startedAt: number; location: "field" | "bench" };
  const stint = new Map<string, Stint>();
  // SUB-01/B4: track stints on an ABSOLUTE game-elapsed timeline that
  // persists across period boundaries. `elapsed_ms` on each event is
  // PER-QUARTER (resets at every quarter_start), so we accumulate each
  // completed quarter's duration and add it to the quarter-local value.
  // Without this, a player subbed on late in Q3 looked identical at the
  // Q4 start to one on since Q1 (both startedAt=0) and got pulled first
  // early in Q4 — the churn this guard fixes.
  let completedQuarterMs = 0;
  // Players on field as of the most recent lineup/swap state, so a break
  // `lineup_set` that re-lists the SAME on-field players does not reset
  // their stint — only genuinely new (bench->field) players restart.
  let prevOnField = new Set<string>();
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
      const at =
        completedQuarterMs +
        (typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0);
      const onFieldArr = leagueOnField(lineup);
      const nowOnField = new Set(onFieldArr);
      for (const id of onFieldArr) {
        // A player continuing on field across the boundary keeps their
        // earlier stint; only a genuinely new field player starts now.
        if (!prevOnField.has(id)) {
          stint.set(id, { startedAt: at, location: "field" });
        }
      }
      for (const id of lineup.bench) {
        stint.set(id, { startedAt: at, location: "bench" });
      }
      prevOnField = nowOnField;
      continue;
    }
    if (ev.type === "quarter_end") {
      // Roll the finished quarter's duration into the absolute timeline.
      completedQuarterMs +=
        typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
      continue;
    }
    // quarter_start no longer resets stints — startedAt is absolute and
    // must survive the period boundary for the recency guard to work.
    if (ev.type === "swap") {
      const at =
        completedQuarterMs +
        (typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0);
      if (meta.off_player_id) {
        stint.set(meta.off_player_id, { startedAt: at, location: "bench" });
        prevOnField.delete(meta.off_player_id);
      }
      if (meta.on_player_id) {
        stint.set(meta.on_player_id, { startedAt: at, location: "field" });
        prevOnField.add(meta.on_player_id);
      }
    }
  }

  // Absolute current game-elapsed = finished quarters + this quarter's
  // (per-quarter) elapsed. msAt is the continuous on-field stint, so the
  // longest-serving player sorts first and the just-arrived one last.
  const absElapsed = completedQuarterMs + elapsedMs;
  const msAt = (id: string) => {
    const s = stint.get(id);
    const startedAt = s?.startedAt ?? 0;
    return Math.max(0, absElapsed - startedAt);
  };
  const zoneOf = (id: string): LeagueZone =>
    currentLineup.forwards.includes(id) ? "forward" : "back";

  // Bench candidates — sorted longest-on-bench first so the
  // player who's been waiting longest gets paired first (mirrors
  // AFL's `suggestSwaps` ascending-game-time sort).
  const benchSorted = [...currentLineup.bench].sort(
    (a, b) => msAt(b) - msAt(a),
  );

  // Field candidates per zone — longest-on-field first within each
  // zone. We mutate cursors as we consume players from each zone
  // bucket so each suggestion picks a fresh off-target.
  const fieldByZone: Record<LeagueZone, string[]> = {
    forward: [],
    back: [],
  };
  for (const id of onFieldIds) {
    if (excludeSet.has(id)) continue;
    fieldByZone[zoneOf(id)].push(id);
  }
  for (const z of ["forward", "back"] as LeagueZone[]) {
    fieldByZone[z].sort((a, b) => msAt(b) - msAt(a));
  }
  const cursor: Record<LeagueZone, number> = { forward: 0, back: 0 };

  const swaps: LeagueSubSuggestion[] = [];
  const usedOff = new Set<string>();
  const usedOn = new Set<string>();

  for (const benchId of benchSorted) {
    if (usedOn.has(benchId)) continue;
    // Prefer same-zone (chip-matched) off-target so the F/B ratio
    // stays stable across rotations. Soft preference: if the
    // matched zone is exhausted, fall back to the other zone.
    const chip = chipByPlayerId?.get(benchId) ?? null;
    const preferredZone: LeagueZone | null
      = chip === "a" ? "forward" : chip === "b" ? "back" : null;
    const zoneOrder: LeagueZone[]
      = preferredZone === "forward"
        ? ["forward", "back"]
        : preferredZone === "back"
          ? ["back", "forward"]
          : ["forward", "back"];
    let pickedOff: string | null = null;
    let pickedZone: LeagueZone | null = null;
    for (const z of zoneOrder) {
      while (cursor[z] < fieldByZone[z].length) {
        const candidate = fieldByZone[z][cursor[z]];
        cursor[z]++;
        if (!usedOff.has(candidate)) {
          pickedOff = candidate;
          pickedZone = z;
          break;
        }
      }
      if (pickedOff) break;
    }
    if (!pickedOff || !pickedZone) break; // no field players left
    usedOff.add(pickedOff);
    usedOn.add(benchId);
    swaps.push({
      off: { playerId: pickedOff, msOnField: msAt(pickedOff) },
      on: { playerId: benchId, msOnBench: msAt(benchId) },
      zone: pickedZone,
    });
  }
  return swaps;
}

// Legacy single-swap helper — keeps callers that only want the
// top suggestion working without rebuilding the array → first
// pattern. New callers should use `suggestLeagueSubs` directly.
export function suggestNextLeagueSub(
  events: GameEvent[],
  currentQuarter: number,
  currentLineup: LeagueLineup,
  excludeOffPlayers: readonly string[],
  elapsedMs: number,
  chipByPlayerId?: ReadonlyMap<string, import("@/lib/types").PlayerChip | null>,
): LeagueSubSuggestion | null {
  const all = suggestLeagueSubs(
    events,
    currentQuarter,
    currentLineup,
    excludeOffPlayers,
    elapsedMs,
    chipByPlayerId,
  );
  return all[0] ?? null;
}
