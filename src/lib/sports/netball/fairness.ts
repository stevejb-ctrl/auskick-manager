// ─── Netball fairness — position-count-per-game ──────────────
// AFL fairness is "zone-minutes": how many minutes has each player
// spent in each zone. Netball substitutions only happen at period
// breaks, so minutes-in-position is a step function (0, 1Q, 2Q, 3Q,
// 4Q worth of minutes). The coach's real question is: has this
// player had a fair spread of positions across the season?
//
// This module counts, per player, how many times they've been
// rostered into each position. Goal Keeper 3 times + Goal Shooter
// 1 time + Wing Attack 2 times ≠ Centre 6 times. The UI surfaces
// the variance so coaches can rotate fairly.
//
// Events consumed:
//   * lineup_set          — initial lineup at start of game
//   * period_break_swap   — lineup about to take the court at each
//                           period break (Q2/Q3/Q4 lineups). metadata:
//                           { quarter: number, lineup: GenericLineup }
//   * quarter_start       — optional anchor; implicit if not present
//   * quarter_end         — closes the period's lineup count

import type { GameEvent } from "@/lib/types";

/** Generic map lineup shape used by netball game_events. */
export interface GenericLineup {
  positions: Record<string, string[]>;
  bench: string[];
}

export type PositionCount = Record<string, number>;
export type PlayerPositionCounts = Record<string, PositionCount>;

/** Safe accessor: counts for a single position. */
function inc(counts: PlayerPositionCounts, playerId: string, positionId: string): void {
  counts[playerId] ??= {};
  counts[playerId][positionId] = (counts[playerId][positionId] ?? 0) + 1;
}

/**
 * Replay one netball game → per-player, per-position appearance counts.
 * Each period where a player starts in a position increments that
 * (player, position) pair by 1. Bench periods aren't counted.
 */
export function gamePositionCounts(events: GameEvent[]): PlayerPositionCounts {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const result: PlayerPositionCounts = {};
  let currentLineup: GenericLineup | null = null;
  let quartersCounted = 0;

  const countLineup = () => {
    if (!currentLineup) return;
    for (const [posId, playerIds] of Object.entries(currentLineup.positions)) {
      for (const pid of playerIds) {
        if (pid) inc(result, pid, posId);
      }
    }
    quartersCounted++;
  };

  for (const ev of sorted) {
    const meta = ev.metadata as {
      lineup?: Partial<GenericLineup>;
      quarter?: number;
    };

    if (ev.type === "lineup_set" && meta.lineup) {
      currentLineup = normaliseGenericLineup(meta.lineup);
    } else if (ev.type === "period_break_swap" && meta.lineup) {
      // Close the current quarter's counts, then adopt the new lineup.
      countLineup();
      currentLineup = normaliseGenericLineup(meta.lineup);
    } else if (ev.type === "game_finalised" && quartersCounted < 4) {
      // Ensure the final quarter gets counted even if no period_break_swap
      // fired (happens at the end of Q4).
      countLineup();
    }
  }

  // If no game_finalised yet but we have a current lineup, count it
  // once so in-progress stats include the current quarter.
  if (quartersCounted === 0 && currentLineup) {
    countLineup();
  }

  return result;
}

/**
 * Build a per-player "third they played in their most recent quarter"
 * map from this-game events. Drives Tier-1 of the suggester: avoid
 * placing a player in the same third two quarters running.
 *
 * Walks events forward; the LATEST lineup-changing event wins for each
 * player, which means at Q3 break the map reflects Q2's lineup, at
 * Q2 break it reflects Q1's lineup, etc. — exactly the "previous
 * quarter" we want to compare against.
 *
 * Players who haven't played any quarter yet (bench-only so far) get
 * no entry — null effectively — which the suggester treats as "no
 * penalty, free to place anywhere".
 */
export function lastQuarterThirds(
  events: GameEvent[],
  thirdOf: ThirdLookup,
): Record<string, "attack-third" | "centre-third" | "defence-third"> {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const out: Record<string, "attack-third" | "centre-third" | "defence-third"> = {};
  for (const ev of sorted) {
    if (ev.type !== "lineup_set" && ev.type !== "period_break_swap") continue;
    const meta = ev.metadata as { lineup?: Partial<GenericLineup> };
    if (!meta.lineup) continue;
    const lineup = normaliseGenericLineup(meta.lineup);
    for (const [posId, ids] of Object.entries(lineup.positions)) {
      const third = thirdOf(posId);
      if (!third) continue;
      for (const pid of ids) {
        if (pid) out[pid] = third;
      }
    }
  }
  return out;
}

/**
 * Build a per-player "set of players who shared their third in the
 * most recent quarter they played" map from this-game events. Drives
 * the teammate-diversity rule in the suggester: spread kids across
 * different teammates from one quarter to the next so they don't
 * play with the same two or three friends every break.
 *
 * Walks events forward; the LATEST lineup-changing event wins for
 * each player. For each lineup, players in the same third are
 * teammates of one another.
 */
export function lastQuarterTeammatesInThird(
  events: GameEvent[],
  thirdOf: ThirdLookup,
): Record<string, Set<string>> {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const out: Record<string, Set<string>> = {};
  for (const ev of sorted) {
    if (ev.type !== "lineup_set" && ev.type !== "period_break_swap") continue;
    const meta = ev.metadata as { lineup?: Partial<GenericLineup> };
    if (!meta.lineup) continue;
    const lineup = normaliseGenericLineup(meta.lineup);
    // Group players by third for this lineup.
    const playersByThird: Record<string, string[]> = {};
    for (const [posId, ids] of Object.entries(lineup.positions)) {
      const third = thirdOf(posId);
      if (!third) continue;
      const list = playersByThird[third] ?? [];
      for (const pid of ids) if (pid) list.push(pid);
      playersByThird[third] = list;
    }
    // Each player's teammate set = the other players in the same
    // third for THIS lineup. Overwrite to keep "most recent quarter".
    for (const ids of Object.values(playersByThird)) {
      for (const pid of ids) {
        const set = new Set<string>();
        for (const other of ids) {
          if (other !== pid) set.add(other);
        }
        out[pid] = set;
      }
    }
  }
  return out;
}

/** Sum counts across many games. Input: events for an entire season. */
export function seasonPositionCounts(events: GameEvent[]): PlayerPositionCounts {
  const byGame = new Map<string, GameEvent[]>();
  for (const ev of events) {
    const arr = byGame.get(ev.game_id) ?? [];
    arr.push(ev);
    byGame.set(ev.game_id, arr);
  }
  const total: PlayerPositionCounts = {};
  byGame.forEach((gameEvents) => {
    const game = gamePositionCounts(gameEvents);
    for (const [pid, counts] of Object.entries(game)) {
      total[pid] ??= {};
      for (const [posId, n] of Object.entries(counts)) {
        total[pid][posId] = (total[pid][posId] ?? 0) + n;
      }
    }
  });
  return total;
}

/** Normalise a partial lineup map into a full { positions, bench } shape. */
export function normaliseGenericLineup(l: Partial<GenericLineup> | null | undefined): GenericLineup {
  return {
    positions: { ...(l?.positions ?? {}) },
    bench: l?.bench ? [...l.bench] : [],
  };
}

/** Empty generic lineup for netball (no positions, empty bench). */
export function emptyGenericLineup(positions: string[]): GenericLineup {
  const p: Record<string, string[]> = {};
  for (const id of positions) p[id] = [];
  return { positions: p, bench: [] };
}

/**
 * Fairness score for a netball team. Measures how evenly each player
 * has played across their positions. 100 = perfectly even rotation;
 * 0 = the most imbalanced roster possible.
 */
export function netballFairnessScore(season: PlayerPositionCounts): number {
  // For each player: compute the coefficient of variation across
  // the positions they've played. Then average across players.
  const playerCvs: number[] = [];
  for (const counts of Object.values(season)) {
    const values = Object.values(counts);
    if (values.length === 0) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) continue;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
    const cv = Math.sqrt(variance) / mean;
    playerCvs.push(cv);
  }
  if (playerCvs.length === 0) return 100;
  const avgCv = playerCvs.reduce((a, b) => a + b, 0) / playerCvs.length;
  return Math.max(0, Math.min(100, Math.round((1 - avgCv) * 100)));
}

// ─── Lineup suggestion — next quarter ────────────────────────
// Given the current season counts and the positions a coach wants
// to field, suggest a lineup that moves each player toward under-
// represented positions. Respects netball rules of play (via the
// eligibility callback) so we never suggest GS on defence.
//
// Scoring is tiered (lexicographic via weighted sum). For each
// candidate (player, position) pairing the score is:
//
//   tier 1 (+100000): the player hasn't played this third yet THIS
//     GAME. Highest priority — cover all three thirds per player
//     across the four quarters wherever possible.
//   tier 2 (-50000):  the player has already played this exact
//     position this game. With 7 positions and 4 quarters, no player
//     should ever need to repeat a position — this penalty is large
//     enough to dominate everything below tier 1.
//   tier 3 (-10000):  the player played in this third LAST QUARTER.
//     Soft preference — keep kids moving across the court between
//     breaks rather than camping in one third.
//   tier 4 (-5000/teammate): one of the player's last-quarter
//     teammates is already placed in this same third for the new
//     quarter. Splits up "always plays with the same friends" pairs
//     so kids share court time with different teammates each break.
//     Magnitude is well below tier 3's -10000 (the "don't repeat
//     third" rule still wins) but big enough that a single overlap
//     dominates any plausible season-rarity tie-break.
//   tier 5 (-seasonCount): season rarity — among otherwise-equal
//     candidates, prefer the position they've played least across
//     the year.
//
// Magnitudes are spaced so a higher tier always dominates lower
// tiers in any plausible squad. Inputs that drive tiers 1, 3 and 4
// (`thirdOf`, `lastQuarterThird`, `previousTeammates`) are optional
// for backward compatibility; when absent those tiers contribute
// nothing.
export interface NetballSuggestInput {
  /** Active player ids for this game. */
  playerIds: string[];
  /** Ordered list of position ids to fill (length = on-field size). */
  positions: string[];
  /** Season counts so far. */
  season: PlayerPositionCounts;
  /** Counts already accumulated this game (so players don't repeat in Q2 what they did in Q1). */
  thisGame: PlayerPositionCounts;
  /** (playerId, positionId) → allowed? — for zone-eligibility overrides. */
  isAllowed: (playerId: string, positionId: string) => boolean;
  /** Deterministic tie-break seed. */
  seed?: number;
  /** Position → third. Required for tiers 1, 3, and 4 to apply. */
  thirdOf?: (positionId: string) => "attack-third" | "centre-third" | "defence-third" | null;
  /** Each player's third in their most recent quarter on the court. Drives tier 3. */
  lastQuarterThird?: Record<string, "attack-third" | "centre-third" | "defence-third">;
  /**
   * Each player's last-quarter teammates (other players who shared
   * their third). Drives tier 4 — placing a player in a third where
   * one of these friends has already landed for the new quarter
   * incurs a -200 penalty per friend, so the same trio doesn't keep
   * playing together break after break.
   */
  previousTeammates?: Record<string, Set<string>>;
  /**
   * Total minutes (in ms) each player has been on court so far this
   * game, summed across all thirds. When provided, this drives the
   * who-plays-vs-who-benches sort directly — least minutes first.
   *
   * Counts (`thisGame`) only see lineup_set / period_break_swap
   * positions, so a player who got mid-quarter-subbed off after one
   * minute counts identically to a teammate who played the whole
   * quarter at the same position. Time-played catches that
   * difference. When absent, the sort falls back to summing the
   * `thisGame` position counts (legacy behaviour).
   */
  thisGameTotalMs?: Record<string, number>;
}

export function suggestNetballLineup(input: NetballSuggestInput): GenericLineup {
  const {
    playerIds,
    positions,
    season,
    thisGame,
    isAllowed,
    seed = 0,
    thirdOf,
    lastQuarterThird,
    previousTeammates,
    thisGameTotalMs,
  } = input;
  const lineup = emptyGenericLineup(positions);
  if (playerIds.length === 0) return lineup;

  // Track who's already been placed in each third as we walk the
  // candidate list. Drives tier 4 — when evaluating (X, P) we look
  // at who else is currently slotted into P's third, and apply a
  // penalty for each one that was X's last-quarter teammate.
  const placedInThird: Record<string, Set<string>> = {
    "attack-third": new Set(),
    "centre-third": new Set(),
    "defence-third": new Set(),
  };

  // Pre-compute the set of thirds each player has played this game.
  // Cheap to do once up-front rather than per (player, position) pair.
  const thirdsPlayedThisGame: Record<string, Set<string>> = {};
  if (thirdOf) {
    for (const [pid, posCounts] of Object.entries(thisGame)) {
      const s = new Set<string>();
      for (const [posId, count] of Object.entries(posCounts)) {
        if (count > 0) {
          const t = thirdOf(posId);
          if (t) s.add(t);
        }
      }
      thirdsPlayedThisGame[pid] = s;
    }
  }

  const owed = (pid: string, posId: string): number => {
    const playedThisGameAtPos = thisGame[pid]?.[posId] ?? 0;
    const seasonCount = season[pid]?.[posId] ?? 0;
    const candidateThird = thirdOf ? thirdOf(posId) : null;

    // Tier 1: massive bonus for filling a third the player hasn't
    // touched yet this game. The "play every third every game"
    // objective dominates everything else.
    let unplayedThirdBonus = 0;
    if (candidateThird) {
      const playedThirds = thirdsPlayedThisGame[pid];
      if (!playedThirds || !playedThirds.has(candidateThird)) {
        unplayedThirdBonus = 100000;
      }
    }

    // Tier 2: heavy penalty for repeating the EXACT position this
    // game. With 7 positions and 4 quarters, no player ever NEEDS to
    // repeat a position — when they do it's the algorithm's last
    // resort. Stronger than the same-third-as-last-quarter penalty
    // (which is a softer "keep them moving" preference).
    const samePositionPenalty = playedThisGameAtPos > 0 ? -50000 : 0;

    // Tier 3: soft preference — avoid placing them in the same third
    // they were in last quarter. Beats season rarity but bows to the
    // two harder rules above.
    let sameThirdAsLastPenalty = 0;
    if (candidateThird && lastQuarterThird) {
      const last = lastQuarterThird[pid];
      if (last && last === candidateThird) sameThirdAsLastPenalty = -10000;
    }

    // Tier 4: split last-quarter teammates apart. For each player
    // already placed in this third for the new quarter who was a
    // teammate of `pid` last quarter, deduct 150000.
    //
    // The size matters: it has to BEAT the tier-1 +100000
    // unplayed-third bonus + tier-3 -10000 stale-third penalty so a
    // candidate forced to choose between "fresh third where my Q1
    // teammate already sits" (+100000 + tier4) and "the third I
    // played last quarter alone" (-10000) actually picks the stale
    // third and splits.
    //
    // Earlier this was -5000 ("stay below tier 3 so don't-repeat-
    // third still wins") — but that's exactly the configuration
    // that traps a Q1-centre trio into Q2 clumps when the only fresh
    // third available has one of their mates in it. With -150000:
    //   fresh + 1 mate = +100000 - 150000 = -50000  (loses to stale -10000)
    //   fresh + 2 mates = +100000 - 300000 = -200000 (loses to stale)
    //   fresh + 0 mates = +100000           ✓ still wins over stale
    //
    // Tier 2 (same position, -50000) still combines with tier 3 to
    // give -60000, so "stale third with no clump" beats "same
    // position twice" without needing tier 4 to fire.
    let teammateRepeatPenalty = 0;
    if (candidateThird && previousTeammates) {
      const myPrevMates = previousTeammates[pid];
      if (myPrevMates && myPrevMates.size > 0) {
        const placed = placedInThird[candidateThird];
        if (placed) {
          placed.forEach((other) => {
            if (myPrevMates.has(other)) teammateRepeatPenalty -= 150000;
          });
        }
      }
    }

    // Tier 5: prefer positions they've played least across the season.
    const seasonRarity = -seasonCount;

    return (
      unplayedThirdBonus +
      samePositionPenalty +
      sameThirdAsLastPenalty +
      teammateRepeatPenalty +
      seasonRarity
    );
  };

  // Sort key: minutes played THIS GAME, ascending. The placement
  // loop is greedy — the first `positions.length` players in sort
  // order fill the court, everyone after lands on the bench — so
  // this is the WHO-PLAYS decision, not WHICH-POSITION. Steve's rule:
  //
  //   "Maximise game time. If a player only played 1 minute of a
  //    quarter (mid-quarter sub off, late arrival), they MUST get
  //    court priority over a teammate who's played the whole game."
  //
  // We prefer ms-played (`thisGameTotalMs`) over lineup-counts
  // because counts treat a 1-min stint and an 8-min stint as
  // identical — Steve hit exactly that bug at Q4: Nicola P had
  // played 1 min total and was still benched while teammates with
  // 6+ min were getting court time. When ms isn't provided
  // (older call sites, simple unit tests, pre-game where everyone's
  // at zero), fall back to summing `thisGame` counts so the sort
  // still reflects "fewer prior placements first".
  //
  // Season totals deliberately DON'T appear here — a player who's
  // missed games won't crowd today's bench-Q1 teammate out of
  // their court turn. Position-level season fairness lives in
  // tier 5 of `owed()`.
  //
  // Ties fall back to the seeded shuffle (deterministic, keyed by
  // `seed + 41`).
  const sortKey = (pid: string): number => {
    if (thisGameTotalMs) return thisGameTotalMs[pid] ?? 0;
    return Object.values(thisGame[pid] ?? {}).reduce((a, b) => a + b, 0);
  };

  const shuffled = seededShuffle(playerIds, seed + 41);
  shuffled.sort((a, b) => sortKey(a) - sortKey(b));

  const assigned = new Set<string>();
  const remaining = new Set(positions);

  for (const pid of shuffled) {
    if (remaining.size === 0) {
      lineup.bench.push(pid);
      continue;
    }
    let bestPos: string | null = null;
    let bestScore = -Infinity;
    const remainingList = Array.from(remaining);
    for (const posId of remainingList) {
      if (!isAllowed(pid, posId)) continue;
      const s = owed(pid, posId);
      if (s > bestScore) {
        bestScore = s;
        bestPos = posId;
      }
    }
    if (bestPos === null) {
      lineup.bench.push(pid);
      continue;
    }
    lineup.positions[bestPos].push(pid);
    remaining.delete(bestPos);
    assigned.add(pid);
    // Track placement for tier-4 teammate-diversity scoring on
    // subsequent players in the same loop.
    if (thirdOf) {
      const t = thirdOf(bestPos);
      if (t) placedInThird[t]?.add(pid);
    }
  }

  return lineup;
}

// ─── Replay one game → live state ────────────────────────────
export interface NetballGameState {
  lineup: GenericLineup | null;
  currentQuarter: number;
  quarterEnded: boolean;
  quarterElapsedMs: number;
  teamScore: { goals: number };
  opponentScore: { goals: number };
  /** Goals attributed per player, if player_id was set on the goal event. */
  playerGoals: Record<string, number>;
  finalised: boolean;
  /** ISO timestamp of the current quarter_start event; null when quarter ended. */
  quarterStartedAt: string | null;
}

export function replayNetballGame(events: GameEvent[]): NetballGameState {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const state: NetballGameState = {
    lineup: null,
    currentQuarter: 0,
    quarterEnded: false,
    quarterElapsedMs: 0,
    teamScore: { goals: 0 },
    opponentScore: { goals: 0 },
    playerGoals: {},
    finalised: false,
    quarterStartedAt: null,
  };

  // score_undo: stack the last-N score events to revert.
  const undoStack: Array<"team" | "opp" | { player: string }> = [];

  for (const ev of sorted) {
    const meta = ev.metadata as {
      lineup?: Partial<GenericLineup>;
      quarter?: number;
      elapsed_ms?: number;
      target?: string;
    };

    if (ev.type === "lineup_set" && meta.lineup) {
      state.lineup = normaliseGenericLineup(meta.lineup);
    } else if (ev.type === "period_break_swap" && meta.lineup) {
      state.lineup = normaliseGenericLineup(meta.lineup);
    } else if (ev.type === "quarter_start" && meta.quarter) {
      state.currentQuarter = meta.quarter;
      state.quarterEnded = false;
      state.quarterElapsedMs = 0;
      state.quarterStartedAt = ev.created_at;
    } else if (ev.type === "quarter_end") {
      state.quarterEnded = true;
      state.quarterStartedAt = null;
      state.quarterElapsedMs = meta.elapsed_ms ?? state.quarterElapsedMs;
    } else if (ev.type === "game_finalised") {
      state.finalised = true;
    } else if (ev.type === "goal") {
      state.teamScore.goals++;
      if (ev.player_id) {
        state.playerGoals[ev.player_id] = (state.playerGoals[ev.player_id] ?? 0) + 1;
        undoStack.push({ player: ev.player_id });
      } else {
        undoStack.push("team");
      }
    } else if (ev.type === "opponent_goal") {
      state.opponentScore.goals++;
      undoStack.push("opp");
    } else if (ev.type === "score_undo" && undoStack.length > 0) {
      const last = undoStack.pop()!;
      if (last === "opp") {
        state.opponentScore.goals = Math.max(0, state.opponentScore.goals - 1);
      } else if (last === "team") {
        state.teamScore.goals = Math.max(0, state.teamScore.goals - 1);
      } else {
        state.teamScore.goals = Math.max(0, state.teamScore.goals - 1);
        if (last.player && state.playerGoals[last.player]) {
          state.playerGoals[last.player] = Math.max(0, state.playerGoals[last.player] - 1);
        }
      }
    }
  }

  return state;
}

function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const a = [...arr];
  let s = (seed | 0) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Per-third time accounting ──────────────────────────────
// Like AFL's per-zone minutes, but bucketed by netball's three thirds
// (attack / centre / defence). Each completed quarter contributes
// `periodSeconds` worth of time to whatever third the player's position
// rolled into via primaryThirdFor. The trailing in-progress quarter
// contributes `inProgressMs` (the live clockMs) when the game isn't
// finalised yet, so live court tiles show partial time.
export interface PlayerThirdMs {
  attack: number;
  centre: number;
  defence: number;
}

export interface ThirdLookup {
  (positionId: string): "attack-third" | "centre-third" | "defence-third" | null;
}

/** A slice of an in-progress quarter where a single lineup was active. */
export interface InProgressSegment {
  lineup: GenericLineup;
  durationMs: number;
}

/**
 * In-progress contribution for the trailing (still-open) quarter.
 *
 * When provided, the helper credits each segment's lineup with that
 * segment's durationMs and IGNORES the trailing event-derived lineup.
 * This is how mid-quarter substitutions get accurate per-player time:
 * the sub-out player gets credit up to the substitution moment, the
 * sub-in player gets credit from that moment onwards. Sum of all
 * `durationMs` should equal the actual elapsed time of the quarter.
 *
 * When omitted, the helper falls back to crediting the event-derived
 * trailing lineup with a full periodSeconds (treating the current
 * quarter as if it just closed). Used for finalised + post-game views
 * where the in-progress concept doesn't apply.
 */
export interface InProgressContribution {
  segments: InProgressSegment[];
}

export function playerThirdMs(
  events: GameEvent[],
  inProgressMs: number | null,
  periodSeconds: number,
  thirdLookup: ThirdLookup,
  /**
   * Optional per-player timer override. When provided, the helper
   * IGNORES the event-derived trailing lineup and credits each
   * segment's lineup with that segment's durationMs instead. Each
   * on-court player's clock therefore reflects their own time on
   * court, not the time of whoever was in their position before a
   * mid-quarter substitution. See the InProgressContribution comment
   * above for the full contract.
   */
  inProgress?: InProgressContribution,
  /**
   * @deprecated single-segment override. Use `inProgress` for the
   * accurate per-player split. Retained as a backward-compatible
   * fallback: when provided AND `inProgress` is absent, it overrides
   * the trailing lineup with `inProgressMs` of credit.
   */
  overrideTrailingLineup?: GenericLineup | null,
): Map<string, PlayerThirdMs> {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const out = new Map<string, PlayerThirdMs>();
  const ensure = (pid: string): PlayerThirdMs => {
    let s = out.get(pid);
    if (!s) {
      s = { attack: 0, centre: 0, defence: 0 };
      out.set(pid, s);
    }
    return s;
  };
  const addLineupTime = (lineup: GenericLineup, ms: number) => {
    for (const [posId, ids] of Object.entries(lineup.positions)) {
      const third = thirdLookup(posId);
      if (!third) continue;
      for (const pid of ids) {
        if (!pid) continue;
        const s = ensure(pid);
        if (third === "attack-third") s.attack += ms;
        else if (third === "centre-third") s.centre += ms;
        else if (third === "defence-third") s.defence += ms;
      }
    }
  };

  // Helper: split a closed quarter's time credit using its mid-quarter
  // substitution log. Each sub turns the quarter into more segments,
  // each with a different lineup. This is the SAME segment-building
  // logic NetballLiveGame uses for the live trailing quarter — but
  // run from event metadata so the split survives reload + the
  // transition into the next quarter.
  const creditClosedQuarter = (
    lineup: GenericLineup,
    periodMs: number,
    subs: Array<{
      positionId: string;
      // null when the slot was already empty before the sub (coach
      // lent a player and cancelled the picker, then later tapped
      // the empty token to fill it). Skip the bench-add step for
      // those — there's no sub-out player to push to bench.
      outPlayerId: string | null;
      inPlayerId: string;
      atMs: number;
    }>,
  ) => {
    if (subs.length === 0) {
      addLineupTime(lineup, periodMs);
      return;
    }
    let current = lineup;
    let prevMs = 0;
    for (const sub of subs) {
      const dur = Math.max(0, Math.min(sub.atMs, periodMs) - prevMs);
      if (dur > 0) addLineupTime(current, dur);
      const next: GenericLineup = {
        positions: { ...current.positions },
        bench: current.bench.filter((id) => id !== sub.inPlayerId),
      };
      next.positions[sub.positionId] = (next.positions[sub.positionId] ?? [])
        .filter((id) => sub.outPlayerId == null || id !== sub.outPlayerId)
        .concat([sub.inPlayerId]);
      if (sub.outPlayerId != null && !next.bench.includes(sub.outPlayerId)) {
        next.bench = [...next.bench, sub.outPlayerId];
      }
      current = next;
      prevMs = Math.min(sub.atMs, periodMs);
    }
    const finalDur = Math.max(0, periodMs - prevMs);
    if (finalDur > 0) addLineupTime(current, finalDur);
  };

  let currentLineup: GenericLineup | null = null;
  let hasFinalised = false;

  for (const ev of sorted) {
    const meta = ev.metadata as {
      lineup?: Partial<GenericLineup>;
      midQuarterSubs?: Array<{
        positionId: string;
        outPlayerId: string | null;
        inPlayerId: string;
        atMs: number;
      }>;
    };
    if (ev.type === "lineup_set" && meta.lineup) {
      currentLineup = normaliseGenericLineup(meta.lineup);
    } else if (ev.type === "period_break_swap" && meta.lineup) {
      if (currentLineup) {
        creditClosedQuarter(
          currentLineup,
          periodSeconds * 1000,
          meta.midQuarterSubs ?? [],
        );
      }
      currentLineup = normaliseGenericLineup(meta.lineup);
    } else if (ev.type === "game_finalised") {
      if (currentLineup) {
        creditClosedQuarter(
          currentLineup,
          periodSeconds * 1000,
          meta.midQuarterSubs ?? [],
        );
      }
      currentLineup = null;
      hasFinalised = true;
    }
  }

  if (!hasFinalised) {
    if (inProgress) {
      // Per-player accurate path: each segment is a slice of the
      // in-progress quarter where a single lineup was active. Crediting
      // segment.lineup with segment.durationMs gives the sub-out
      // player their pre-substitution time and the sub-in player their
      // post-substitution time, with no inheritance.
      for (const seg of inProgress.segments) {
        addLineupTime(seg.lineup, seg.durationMs);
      }
    } else if (currentLineup) {
      const ms = inProgressMs ?? periodSeconds * 1000;
      addLineupTime(overrideTrailingLineup ?? currentLineup, ms);
    }
  }

  return out;
}

export function formatMinSec(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
