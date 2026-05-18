// ─── Rugby league kick rotations ─────────────────────────────
// Junior rugby league has TWO rotation mechanics on the kicking
// side of the game:
//
//   1. Goal-kick (conversion) rotation — Junior Laws §15:
//      "Once a player has attempted a kick at goal (whether
//      successful or not), that player may not attempt another
//      until all others of the same team (on the field at the
//      time) have been given an attempt at a goal."
//
//      The cycle resets when every on-field player has attempted.
//      A coach who tries to record a second kick from the same
//      player out-of-turn gets blocked unless they explicitly
//      `force: true` (the laws' fouled-in-act-of-scoring carve-out).
//
//   2. Kickoff rotation — Junior Laws §16:
//      "Once a player has taken a kickoff to start the quarter that
//      player may not take another kickoff until all other players
//      of the same team have been given an opportunity to kick."
//
//      Same shape as goal-kick but uses the FULL squad rather than
//      just the on-field pool — the kicker is selected just before
//      the whistle and may still be warming up off-field.
//
// All state derives from `conversion_attempt` and `kickoff_taken`
// events. No DB columns. Pure functions, fully unit-tested.

import type { GameEvent } from "@/lib/types";

// ─── Conversion attempts ─────────────────────────────────────

interface ConversionEvent {
  player_id: string;
  made: boolean;
  force: boolean;
  created_at: string;
}

function readConversionEvents(events: GameEvent[]): ConversionEvent[] {
  const out: ConversionEvent[] = [];
  for (const ev of events) {
    if (ev.type !== "conversion_attempt") continue;
    if (!ev.player_id) continue;
    const meta = ev.metadata as { made?: boolean; force?: boolean };
    out.push({
      player_id: ev.player_id,
      made: meta.made === true,
      force: meta.force === true,
      created_at: ev.created_at,
    });
  }
  out.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return out;
}

/**
 * Folds `score_undo` events into the conversion list. Each undo
 * pops the most recent conversion attempt off the stack (LIFO),
 * matching the replay engine's behaviour in `replayLeagueGame`.
 * The cycle derivation uses the surviving attempts only.
 *
 * `score_undo` is a generic event that can target any scoring
 * type, so we pair it with the most recent surviving
 * conversion_attempt — if the most recent scoring event was a try,
 * the undo doesn't touch this stack. The pairing follows the same
 * shape as the rest of the score-log machinery.
 */
function survivingConversionEvents(events: GameEvent[]): ConversionEvent[] {
  // Walk events chronologically; maintain a per-scoring-type LIFO
  // stack. score_undo events pop whichever scoring type was at the
  // top of the global score stack — same pairing the replay
  // engine uses.
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  // We track every scoring event in the order they happen, keep a
  // `kept` flag for each. score_undo flips the latest still-kept
  // entry's flag to false. At the end we filter conversion entries
  // by `kept`.
  type Entry =
    | { kind: "conversion"; index: number; kept: boolean }
    | { kind: "other"; index: number; kept: boolean };
  const stack: Entry[] = [];
  const conv: ConversionEvent[] = [];

  for (const ev of sorted) {
    if (
      ev.type === "try"
      || ev.type === "opponent_try"
      || ev.type === "opponent_conversion"
    ) {
      stack.push({ kind: "other", index: -1, kept: true });
    } else if (ev.type === "conversion_attempt" && ev.player_id) {
      const meta = ev.metadata as { made?: boolean; force?: boolean };
      conv.push({
        player_id: ev.player_id,
        made: meta.made === true,
        force: meta.force === true,
        created_at: ev.created_at,
      });
      stack.push({ kind: "conversion", index: conv.length - 1, kept: true });
    } else if (ev.type === "score_undo") {
      // Pop the most recent kept entry off the stack.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].kept) {
          stack[i].kept = false;
          if (stack[i].kind === "conversion") {
            conv[(stack[i] as { index: number }).index] = {
              ...conv[(stack[i] as { index: number }).index],
              // mark for filtering via the stack's kept flag below;
              // we don't mutate the player_id here.
            };
          }
          break;
        }
      }
    }
  }

  // Build the surviving list by walking the stack in order.
  const survivors: ConversionEvent[] = [];
  for (const entry of stack) {
    if (entry.kind === "conversion" && entry.kept) {
      survivors.push(conv[(entry as { index: number }).index]);
    }
  }
  return survivors;
}

export interface ConversionCycleInfo {
  /** Players who've attempted in the current (un-reset) cycle. */
  attempted: Set<string>;
  /** True when the cycle is complete — every on-field player has had a turn. */
  cycleComplete: boolean;
  /** Total surviving (non-undone) conversion attempts in the current cycle. */
  countInCycle: number;
}

/**
 * Conversion-cycle state given the players currently on the field.
 *
 * Algorithm: walk surviving conversion attempts in order, tracking
 * an "attempted-this-cycle" set. After each attempt, if the set
 * covers `onFieldPlayerIds`, the cycle is complete and resets to
 * empty for the next attempt. The returned `attempted` is the set
 * AFTER the last attempt — i.e. who's already kicked since the
 * last reset.
 *
 * Subset semantics: when a non-kicker subs ON, the eligibility
 * pool grows and the cycle isn't complete until they kick. When a
 * non-kicker subs OFF, the pool shrinks — completion happens on
 * the next attempt's evaluation.
 */
export function conversionCycle(
  events: GameEvent[],
  onFieldPlayerIds: string[],
): ConversionCycleInfo {
  const survivors = survivingConversionEvents(events);
  const onField = new Set(onFieldPlayerIds);
  let attempted = new Set<string>();
  let countInCycle = 0;

  for (const e of survivors) {
    attempted.add(e.player_id);
    countInCycle++;
    // Cycle complete = every currently-on-field player has kicked
    // in this cycle. (Same subset check the live UI uses.)
    if (
      onField.size > 0
      && Array.from(onField).every((id) => attempted.has(id))
    ) {
      attempted = new Set<string>();
      countInCycle = 0;
    }
  }

  const cycleComplete
    = onField.size > 0
    && Array.from(onField).every((id) => attempted.has(id));

  return { attempted, cycleComplete, countInCycle };
}

/**
 * Surviving conversion attempts totalled per player across the whole
 * game — does NOT reset with the cycle. Used to layer in a
 * "fresh-bench-player gets priority" preference on top of the cycle
 * eligibility, so a player who's never kicked in the match jumps
 * the queue over anyone who has. Also exposed for the dialog so it
 * can label players who've kicked earlier in the game even after
 * the cycle has reset.
 */
export function totalConversionAttemptsByPlayer(
  events: GameEvent[],
): Record<string, number> {
  return totalAttemptsByPlayer(events);
}

function totalAttemptsByPlayer(events: GameEvent[]): Record<string, number> {
  const survivors = survivingConversionEvents(events);
  const out: Record<string, number> = {};
  for (const e of survivors) {
    out[e.player_id] = (out[e.player_id] ?? 0) + 1;
  }
  return out;
}

/**
 * Players eligible to take the next conversion. Two-tier priority:
 *
 *   1. ON-FIELD players who have NEVER kicked in this match —
 *      they always go first. Without this layer, a fresh bench
 *      sub-on (who has 0 game-attempts) gets lost in the pool the
 *      moment the cycle resets, because the cycle is empty for
 *      everyone post-reset (Steve 2026-05-18).
 *
 *   2. Otherwise: on-field players who haven't kicked in the
 *      current cycle. If all on-field have kicked this cycle, the
 *      full pool is eligible — fresh rotation.
 */
export function nextEligibleConversionKickers(
  events: GameEvent[],
  onFieldPlayerIds: string[],
): string[] {
  // Tier 1: never-kicked-this-game on-field players win outright.
  const totalAttempts = totalAttemptsByPlayer(events);
  const neverKicked = onFieldPlayerIds.filter(
    (id) => (totalAttempts[id] ?? 0) === 0,
  );
  if (neverKicked.length > 0) return neverKicked;
  // Tier 2: standard cycle-eligibility pool.
  const { attempted } = conversionCycle(events, onFieldPlayerIds);
  const pool = onFieldPlayerIds.filter((id) => !attempted.has(id));
  return pool.length > 0 ? pool : onFieldPlayerIds;
}

export interface PlayerConversionStatus {
  /** Attempts in the current (un-reset) cycle. */
  attemptsInCycle: number;
  /** Made attempts in the current cycle. */
  madeInCycle: number;
  /** True when at least one of this player's cycle attempts used force. */
  hasForceInCycle: boolean;
}

/**
 * Per-player conversion status for the current cycle. Drives the
 * on-field boot badge — the badge renders when `attemptsInCycle >
 * 0`, and the `madeInCycle / attemptsInCycle` ratio drives the
 * made/missed ring colour. `hasForceInCycle` flags the rare
 * fouled-in-act-of-scoring override so the UI can show a small `!`
 * overlay (Phase 5 polish).
 */
export function playerConversionStatusInCycle(
  events: GameEvent[],
  onFieldPlayerIds: string[],
): Record<string, PlayerConversionStatus> {
  const survivors = survivingConversionEvents(events);
  const onField = new Set(onFieldPlayerIds);

  let inCycle: Record<string, PlayerConversionStatus> = {};
  let attempted = new Set<string>();

  for (const e of survivors) {
    attempted.add(e.player_id);
    inCycle[e.player_id] ??= {
      attemptsInCycle: 0,
      madeInCycle: 0,
      hasForceInCycle: false,
    };
    const slot = inCycle[e.player_id];
    slot.attemptsInCycle++;
    if (e.made) slot.madeInCycle++;
    if (e.force) slot.hasForceInCycle = true;
    if (
      onField.size > 0
      && Array.from(onField).every((id) => attempted.has(id))
    ) {
      // Cycle complete — reset.
      attempted = new Set<string>();
      inCycle = {};
    }
  }

  return inCycle;
}

// ─── Kickoffs ────────────────────────────────────────────────

interface KickoffEvent {
  player_id: string;
  period: number;
  created_at: string;
}

function readKickoffEvents(events: GameEvent[]): KickoffEvent[] {
  const out: KickoffEvent[] = [];
  for (const ev of events) {
    if (ev.type !== "kickoff_taken") continue;
    if (!ev.player_id) continue;
    const meta = ev.metadata as { period?: number };
    if (typeof meta.period !== "number") continue;
    out.push({
      player_id: ev.player_id,
      period: meta.period,
      created_at: ev.created_at,
    });
  }
  out.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return out;
}

export interface KickoffCycleInfo {
  /** Players who've taken a kickoff in the current cycle. */
  taken: Set<string>;
  /** True when every squad player has taken at least one kickoff in this cycle. */
  cycleComplete: boolean;
}

/**
 * Kickoff-rotation state given the full team squad (Junior Laws
 * §16 — "all other players of the same team"). Same cycle-reset
 * algorithm as conversion rotation, but the eligibility pool is
 * the full squad rather than just on-field.
 */
export function kickoffCycle(
  events: GameEvent[],
  squadPlayerIds: string[],
): KickoffCycleInfo {
  const sorted = readKickoffEvents(events);
  const squad = new Set(squadPlayerIds);
  let taken = new Set<string>();

  for (const e of sorted) {
    taken.add(e.player_id);
    if (
      squad.size > 0
      && Array.from(squad).every((id) => taken.has(id))
    ) {
      taken = new Set<string>();
    }
  }

  const cycleComplete
    = squad.size > 0 && Array.from(squad).every((id) => taken.has(id));

  return { taken, cycleComplete };
}

/**
 * Players eligible to take the next kickoff: squad players who
 * haven't kicked off in the current cycle. If every squad player
 * has, the full squad is eligible (the cycle has just reset).
 *
 * The picker takes this as input and surfaces it as a short list
 * of taps at the period-start prompt.
 */
export function nextEligibleKickoffTakers(
  events: GameEvent[],
  squadPlayerIds: string[],
): string[] {
  const { taken } = kickoffCycle(events, squadPlayerIds);
  const pool = squadPlayerIds.filter((id) => !taken.has(id));
  return pool.length > 0 ? pool : squadPlayerIds;
}

/**
 * Has a kickoff already been recorded for this period? Used by the
 * orchestrator to decide whether to surface the kickoff prompt at
 * a period start (suppress if the coach already picked one).
 */
export function kickoffRecordedForPeriod(
  events: GameEvent[],
  period: number,
): boolean {
  return readKickoffEvents(events).some((e) => e.period === period);
}

/**
 * Set of every player who has taken a kickoff this game — drives
 * the small "K" chip on the player tile so the coach can see at a
 * glance who's already had a turn.
 */
export function kickoffTakers(events: GameEvent[]): Set<string> {
  return new Set(readKickoffEvents(events).map((e) => e.player_id));
}
