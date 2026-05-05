// ============================================================
// Fairness engine — pure functions. No Supabase, no React.
//
// Inputs: an array of GameEvents (one team's whole season, or
// a single game). Outputs: zone-minutes per player, suggested
// starting lineups, suggested mid-game swaps.
//
// Zones may be 3 (back/mid/fwd — U8-U12) or 5 (adds hback/hfwd
// for U13+). All per-zone records carry all 5 keys; unused zones
// are simply zero. `zoneCaps` with 0 means "no slots" so the UI
// skips that position.
// ============================================================

import {
  emptyLineup,
  normalizeLineup,
  type GameEvent,
  type Lineup,
  type Player,
  type PositionModel,
  type Zone,
} from "@/lib/types";
import { positionsFor } from "@/lib/ageGroups";

export type ZoneMinutes = Record<Zone, number>;
export type PlayerZoneMinutes = Record<string, ZoneMinutes>;

export const ALL_ZONES: Zone[] = ["back", "hback", "mid", "hfwd", "fwd"];
// Legacy export retained for 3-zone call sites that don't know the model.
export const ZONES: Zone[] = ["back", "mid", "fwd"];

export type ZoneCaps = Record<Zone, number>;

function emptyCaps(): ZoneCaps {
  return { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
}

// Distribute an on-field size across the model's zones.
// 3-zone: remainder fills mid first, then back (11 → 4-4-3, 10 → 3-4-3, 9 → 3-3-3).
// 5-position: remainder fills mid first, then the half-lines, then back/fwd.
export function zoneCapsFor(
  onFieldSize: number,
  model: PositionModel = "zones3"
): ZoneCaps {
  const zones = positionsFor(model);
  const hardMax = model === "positions5" ? 18 : 15;
  const size = Math.max(0, Math.min(hardMax, Math.floor(onFieldSize)));
  const base = Math.floor(size / zones.length);
  const rem = size % zones.length;
  const caps = emptyCaps();
  for (const z of zones) caps[z] = base;
  // Fill remainder in this priority order. For 3-zone this collapses to
  // [mid, back]; for 5-position [mid, hback, hfwd, back, fwd].
  const priority: Zone[] =
    model === "positions5"
      ? ["mid", "hback", "hfwd", "back", "fwd"]
      : ["mid", "back", "fwd"];
  for (let i = 0; i < rem; i++) caps[priority[i]]++;
  return caps;
}

// ─── Helpers ──────────────────────────────────────────────────
function emptyZM(): ZoneMinutes {
  return { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
}

export function emptyZoneMs(): ZoneMinutes {
  return emptyZM();
}

function zoneOf(lineup: Lineup, playerId: string): Zone | null {
  for (const z of ALL_ZONES) {
    if (lineup[z].includes(playerId)) return z;
  }
  return null;
}

function cloneLineup(l: Lineup): Lineup {
  return {
    back: [...l.back],
    hback: [...l.hback],
    mid: [...l.mid],
    hfwd: [...l.hfwd],
    fwd: [...l.fwd],
    bench: [...l.bench],
  };
}

function activeZones(caps: ZoneCaps): Zone[] {
  return ALL_ZONES.filter((z) => caps[z] > 0);
}

// ─── Replay one game's events → per-player zone minutes ──────
export function gameZoneMinutes(events: GameEvent[]): PlayerZoneMinutes {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
  const result: PlayerZoneMinutes = {};
  const add = (pid: string, zone: Zone, ms: number) => {
    if (ms <= 0) return;
    result[pid] ??= emptyZM();
    result[pid][zone] += ms / 60000;
  };

  let lineup: Lineup | null = null;
  let stintStart: Record<string, number> = {};
  let stintZ: Record<string, Zone> = {};

  for (const ev of sorted) {
    const meta = ev.metadata as {
      elapsed_ms?: number;
      quarter?: number;
      lineup?: Partial<Lineup>;
      off_player_id?: string;
      on_player_id?: string;
      zone?: Zone;
    };
    const elapsed = meta.elapsed_ms ?? 0;

    if (ev.type === "lineup_set" && meta.lineup) {
      lineup = normalizeLineup(meta.lineup);
    } else if (ev.type === "quarter_start") {
      stintStart = {};
      stintZ = {};
      if (lineup) {
        for (const z of ALL_ZONES) {
          for (const p of lineup[z]) {
            stintStart[p] = 0;
            stintZ[p] = z;
          }
        }
      }
    } else if (ev.type === "swap" && lineup && meta.on_player_id && meta.zone) {
      const off = meta.off_player_id ?? "";
      const on = meta.on_player_id;
      const z = meta.zone;
      if (off) {
        const sz = stintZ[off] ?? z;
        add(off, sz, elapsed - (stintStart[off] ?? 0));
        delete stintStart[off];
        delete stintZ[off];
        lineup[z] = lineup[z].map((p) => (p === off ? on : p));
        lineup.bench = [...lineup.bench.filter((p) => p !== on), off];
      } else {
        lineup[z] = [...lineup[z], on];
        lineup.bench = lineup.bench.filter((p) => p !== on);
      }
      stintStart[on] = elapsed;
      stintZ[on] = z;
    } else if (ev.type === "quarter_end" && lineup) {
      for (const [pid, start] of Object.entries(stintStart)) {
        const z = stintZ[pid];
        if (z) add(pid, z, elapsed - start);
      }
      stintStart = {};
      stintZ = {};
    } else if (ev.type === "player_arrived" && lineup && ev.player_id) {
      if (!lineup.bench.includes(ev.player_id)) lineup.bench.push(ev.player_id);
    } else if (ev.type === "injury" && lineup && ev.player_id) {
      const pid = ev.player_id;
      const injured = (ev.metadata as { injured?: boolean }).injured ?? true;
      if (injured) {
        const z = zoneOf(lineup, pid);
        if (z) {
          const sz = stintZ[pid] ?? z;
          add(pid, sz, elapsed - (stintStart[pid] ?? 0));
          delete stintStart[pid];
          delete stintZ[pid];
          lineup[z] = lineup[z].filter((p) => p !== pid);
          if (!lineup.bench.includes(pid)) lineup.bench.push(pid);
        }
      }
    } else if (ev.type === "player_loan" && lineup && ev.player_id) {
      const pid = ev.player_id;
      const loaned = (ev.metadata as { loaned?: boolean }).loaned ?? true;
      if (loaned) {
        // Starting a loan — if on-field, close zone stint and move to bench.
        const z = zoneOf(lineup, pid);
        if (z) {
          const sz = stintZ[pid] ?? z;
          add(pid, sz, elapsed - (stintStart[pid] ?? 0));
          delete stintStart[pid];
          delete stintZ[pid];
          lineup[z] = lineup[z].filter((p) => p !== pid);
          if (!lineup.bench.includes(pid)) lineup.bench.push(pid);
        }
      }
    }
  }

  return result;
}

// ─── Loan minutes: per-game and per-season aggregation ───────
// Loan stints are opened by a player_loan event with loaned=true and closed
// by another with loaned=false, by quarter_end, or by game_finalised. We
// only count elapsed ms between start and close, so a stint that spans
// quarters picks up correctly (elapsed resets at each quarter_start).
export function gameLoanMinutes(events: GameEvent[]): Record<string, number> {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
  const total: Record<string, number> = {};
  const stintStart: Record<string, number> = {};
  const addMs = (pid: string, ms: number) => {
    if (ms <= 0) return;
    total[pid] = (total[pid] ?? 0) + ms / 60000;
  };

  for (const ev of sorted) {
    const meta = ev.metadata as { elapsed_ms?: number; loaned?: boolean };
    const elapsed = meta.elapsed_ms ?? 0;

    if (ev.type === "player_loan" && ev.player_id) {
      const pid = ev.player_id;
      const loaned = meta.loaned ?? true;
      if (loaned) {
        stintStart[pid] = elapsed;
      } else if (stintStart[pid] !== undefined) {
        addMs(pid, elapsed - stintStart[pid]);
        delete stintStart[pid];
      }
    } else if (ev.type === "quarter_end" || ev.type === "game_finalised") {
      for (const [pid, start] of Object.entries(stintStart)) {
        addMs(pid, elapsed - start);
      }
      // quarter_end closes the stint for accounting purposes, but if the
      // player is still loaned the next quarter_start re-opens it at elapsed=0.
      if (ev.type === "quarter_end") {
        for (const pid of Object.keys(stintStart)) stintStart[pid] = 0;
      } else {
        for (const pid of Object.keys(stintStart)) delete stintStart[pid];
      }
    } else if (ev.type === "quarter_start") {
      // Re-anchor any active loan stint to the new quarter's elapsed=0.
      for (const pid of Object.keys(stintStart)) stintStart[pid] = 0;
    }
  }

  return total;
}

// Sum loan minutes across every game's events.
export function seasonLoanMinutes(events: GameEvent[]): Record<string, number> {
  const byGame = new Map<string, GameEvent[]>();
  for (const ev of events) {
    const arr = byGame.get(ev.game_id) ?? [];
    arr.push(ev);
    byGame.set(ev.game_id, arr);
  }
  const total: Record<string, number> = {};
  byGame.forEach((gameEvents) => {
    const perGame = gameLoanMinutes(gameEvents);
    for (const [pid, mins] of Object.entries(perGame)) {
      total[pid] = (total[pid] ?? 0) + mins;
    }
  });
  return total;
}

// ─── Teammate cohorts from a single lineup snapshot ──────────
/**
 * Given one lineup, build a per-player set of "teammates" — the
 * other players in the same cohort, where a cohort is any active
 * zone OR the bench. Used by the suggester's partnership-breaking
 * penalty: two players who shared a zone (or both sat the bench)
 * one quarter shouldn't both end up in the same new zone the next
 * quarter. Mirrors lastQuarterTeammatesInThird in netball/fairness.ts.
 *
 * The bench cohort is included so a Q1 bench duo doesn't get
 * placed in the same Q2 zone — even though they didn't play
 * together, they "sat together" and partnership-breaking applies
 * with the same intent.
 *
 * Returns {} when the lineup is entirely empty. Pinned players are
 * included in their cohort just like everyone else; the suggester
 * still respects their pin, but their teammates can be penalised
 * around them.
 */
export function zoneTeammatesFromLineup(
  lineup: Lineup
): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  const cohorts: string[][] = [];
  for (const z of ALL_ZONES) {
    if (lineup[z].length > 0) cohorts.push(lineup[z]);
  }
  if (lineup.bench.length > 0) cohorts.push(lineup.bench);
  for (const cohort of cohorts) {
    for (const pid of cohort) {
      const set = new Set<string>();
      for (const other of cohort) {
        if (other !== pid) set.add(other);
      }
      out[pid] = set;
    }
  }
  return out;
}

// ─── Per-player season availability (played vs available) ────
/**
 * For each player, count quarters they were on court vs quarters
 * they were "available" (on court OR on the bench). The ratio
 * playedQuarters / availableQuarters drives the suggester's
 * sort tiebreak — among players tied on this-game minutes, the
 * one with the LOWER played/available ratio gets court priority.
 *
 * Steve's framing: "If someone is away this is not available time."
 * Missed games don't count against a player; they just don't appear
 * in the totals. So a kid who turned up to 5 games at 100% court
 * time and a kid who turned up to 5 games at 60% court time are
 * compared on their respective ratios.
 *
 * Implementation: walk every `lineup_set` event in the input. Each
 * one represents one quarter's starting roster (AFL writes a
 * `lineup_set` at game start AND at every Q-break where the lineup
 * actually changed). Players in zones get +1 played + +1 available;
 * players on bench get +1 available only.
 *
 * Caveat: AFL skips the lineup_set write at a Q-break when the
 * lineup is unchanged from the prior quarter, so a kid who played
 * the full 4 quarters of a game at the same zone may show as
 * "1 quarter played, 1 available" rather than 4/4. Acceptable for
 * v1: the ratio (1.0) is correct, just the absolute counts are
 * lower than they could be — which doesn't change the tiebreak
 * outcome since this function is only used as a comparator.
 *
 * Mirrors src/lib/sports/netball/fairness.ts seasonAvailability,
 * scaled to AFL's lineup shape.
 */
export interface SeasonAvailability {
  /** Quarters spent on court across all games in the input. */
  playedQuarters: number;
  /** Quarters spent on either court or bench (i.e. attended). */
  availableQuarters: number;
}
export function seasonAvailability(
  events: GameEvent[]
): Record<string, SeasonAvailability> {
  const out: Record<string, SeasonAvailability> = {};
  const ensure = (pid: string): SeasonAvailability => {
    let s = out[pid];
    if (!s) {
      s = { playedQuarters: 0, availableQuarters: 0 };
      out[pid] = s;
    }
    return s;
  };
  for (const ev of events) {
    if (ev.type !== "lineup_set") continue;
    const meta = ev.metadata as { lineup?: Partial<Lineup> } | null;
    if (!meta?.lineup) continue;
    const lineup = normalizeLineup(meta.lineup);
    for (const z of ALL_ZONES) {
      for (const pid of lineup[z]) {
        if (!pid) continue;
        const s = ensure(pid);
        s.playedQuarters++;
        s.availableQuarters++;
      }
    }
    for (const pid of lineup.bench) {
      if (!pid) continue;
      ensure(pid).availableQuarters++;
    }
  }
  return out;
}

// ─── Sum zone minutes across many games ──────────────────────
export function seasonZoneMinutes(events: GameEvent[]): PlayerZoneMinutes {
  const byGame = new Map<string, GameEvent[]>();
  for (const ev of events) {
    const arr = byGame.get(ev.game_id) ?? [];
    arr.push(ev);
    byGame.set(ev.game_id, arr);
  }
  const total: PlayerZoneMinutes = {};
  byGame.forEach((gameEvents) => {
    const game = gameZoneMinutes(gameEvents);
    for (const [pid, zm] of Object.entries(game)) {
      total[pid] ??= emptyZM();
      for (const z of ALL_ZONES) total[pid][z] += zm[z];
    }
  });
  return total;
}

// ─── Suggest a starting lineup ───────────────────────────────
// Scoring is a sum of four signals plus per-iteration partnership penalty:
//
//   IN_GAME_DIVERSITY  (+1000)    "Haven't played this zone this game" → strong
//                                  pull. Drives every kid through every zone in
//                                  a single game.
//   SEASON_DIVERSITY   (+500)     "Haven't played this zone for ≥ 1 quarter all
//                                  season" → over a season every kid hits all 3.
//   SAME_AS_LAST_Q     (-800)     "Was in this zone last quarter" → don't park
//                                  a kid in the same line two quarters running.
//   FAIRNESS_TERM      (~ small)  Continuous: avg zone mins across the squad
//                                  minus this player's mins for that zone.
//   PARTNERSHIP_PENALTY (-2000/teammate)
//                                  Applied at placement time: every Q-1 cohort
//                                  mate (same zone OR same bench) already
//                                  placed in target zone makes that zone less
//                                  attractive. Stops a Q1 trio camping
//                                  together in the same Q2 zone, AND splits up
//                                  bench-mates so Q2 doesn't keep them sitting
//                                  side-by-side again. Magnitude is tuned so
//                                  one teammate flips the preference: fresh
//                                  zone with one mate (1000-2000=-1000) loses
//                                  to a stale zone with no mates (-800), but
//                                  fresh with no mates (+1000) still beats
//                                  stale (-800). Replaces the older
//                                  CLUSTER_PENALTY (-300/source-zone-peer):
//                                  partnership tracks specific kids rather
//                                  than zone buckets, catches bench cohorts
//                                  too, and is the same shape the netball
//                                  suggester uses (tier 4).
//
// `currentGame`            – zone minutes accumulated so far this game.
// `pinnedPositions`        – players who must stay in their current zone (e.g.
//                            recent arrivals, field/zone-locked) — bypass all
//                            scoring.
// `previousQuarterZones`   – per-player zone they ended the previous quarter
//                            in. Drives the SAME_AS_LAST_Q penalty.
//                            Empty/missing for Q1 of a game.
// `previousZoneTeammates`  – per-player set of cohort mates from last
//                            quarter (zone-mates OR bench-mates). Drives
//                            PARTNERSHIP_PENALTY. See zoneTeammatesFromLineup
//                            for the canonical builder. Empty/missing for Q1.
//
// Sort key (who plays vs who benches):
//   The placement loop iterates players in ASCENDING order of in-game
//   zone minutes — the kid who's been on the bench all of Q1 climbs
//   ahead of teammates who played the full quarter. Steve's rule:
//   "those who have had the least game time should have the least
//   subs."
//
//   Attendance-history is DELIBERATELY NOT a factor in this sort.
//   Per Steve: "It is ok to penalise players who have missed games on
//   total game time. Over the season the split between positions
//   should be balanced, but not total game time. A player who turns up
//   every week should not be benched because another player only turns
//   up half the time." So a kid who's missed 5 games doesn't get
//   priority over the regulars when they show up — they just rotate
//   like everyone else who attended today. (Position-level season
//   diversity is still enforced by SEASON_DIVERSITY in the owed-score
//   below — that's about WHICH ZONE each kid plays, not how MUCH.)
//
//   When `currentGame` is empty (start of Q1, simple unit tests), all
//   players have zero ms played → ties → seeded shuffle decides Q1's
//   starting bench (3 of 15 in U10). That's intentional: arbitrary at
//   Q1, but the in-game ms sort fully evens out by Q4.
//
//   `seasonAvail` was previously a tiebreak (commit 8727109) — REMOVED
//   per the rule above. The param stays optional/ignored for
//   backward-compat with any external test caller.
export function suggestStartingLineup(
  availablePlayers: Player[],
  season: PlayerZoneMinutes,
  seed: number = 0,
  zoneCaps: ZoneCaps = { back: 4, hback: 0, mid: 4, hfwd: 0, fwd: 4 },
  currentGame: PlayerZoneMinutes = {},
  pinnedPositions: Record<string, Zone> = {},
  previousQuarterZones: Record<string, Zone> = {},
  previousZoneTeammates: Record<string, Set<string>> = {},
  // Deprecated — kept for back-compat, no longer drives sorting.
  // The leading underscore signals "intentionally unused" to TS's
  // noUnusedParameters check; Next's eslint config doesn't define
  // @typescript-eslint/no-unused-vars so we don't disable it here.
  _seasonAvail: Record<string, SeasonAvailability> = {},
  /**
   * Per-player chip key (a | b | c | null). Triggers the chip-spread
   * penalty so chips of the same kind don't bunch up in one zone.
   * Soft constraint: never blocks a placement. Empty map = no
   * chip awareness, which is the legacy behaviour.
   */
  chipByPlayerId: Record<string, "a" | "b" | "c" | null | undefined> = {},
  /**
   * Per-chip behaviour mode. "split" (default) is the launched Phase
   * D behaviour — chip-mates spread across zones. "group" inverts
   * the penalty into a bonus so chip-mates funnel into the same zone
   * (e.g. a player who needs to stay paired with specific teammates).
   * Missing keys default to "split".
   */
  chipModeByKey: Partial<Record<"a" | "b" | "c", "split" | "group">> = {},
): Lineup {
  const lineup = emptyLineup();
  if (availablePlayers.length === 0) return lineup;

  const zones = activeZones(zoneCaps);
  const zoneFill: ZoneCaps = emptyCaps();
  const pinnedIds = new Set<string>();

  // Place pinned players first so their slots are accounted for before the
  // general assignment runs.
  for (const p of availablePlayers) {
    const z = pinnedPositions[p.id];
    if (z && zones.includes(z) && zoneFill[z] < zoneCaps[z]) {
      lineup[z].push(p.id);
      zoneFill[z]++;
      pinnedIds.add(p.id);
    }
  }

  const avgPerZone = (() => {
    const zm = Object.values(season);
    if (zm.length === 0 || zones.length === 0) return 0;
    let total = 0;
    for (const p of zm) for (const z of zones) total += p[z];
    return total / (zm.length * zones.length);
  })();

  const IN_GAME_DIVERSITY = 1000;
  // 500 < 1000 so an in-game-fresh zone always beats a season-fresh-but-
  // already-played-this-game zone. (Season diversity nudges, in-game forces.)
  const SEASON_DIVERSITY = 500;
  // 800 is below IN_GAME_DIVERSITY (1000), so the same-as-last-quarter penalty
  // is still subordinate to playing a fresh-this-game zone — but it's strong
  // enough to break ties cleanly when in-game diversity is even (e.g. mid-
  // game in Q3 when all zones have already been played).
  const SAME_AS_LAST_Q = 800;
  // Per-teammate penalty for partnership avoidance. Tuned so one prior-
  // quarter mate already in a target zone flips the preference: with
  // IN_GAME_DIVERSITY (+1000) and SAME_AS_LAST_Q (-800), a fresh zone with
  // one mate scores 1000-2000=-1000, losing to a stale zone with no mates
  // (-800). A fresh zone with NO mates still wins clearly (+1000 vs -800).
  // Two mates (-4000) make the target essentially unreachable.
  const PARTNERSHIP_PENALTY = 2000;
  // "Played this zone for ≥ a full quarter all season" threshold (in ms).
  // 12 * 60 * 1000 matches QUARTER_MS in liveGameStore — kept local here so
  // fairness.ts stays a leaf module with no store imports.
  const FULL_QUARTER_MS = 12 * 60 * 1000;

  const owed = (pid: string, z: Zone) => {
    const gameMins = currentGame[pid]?.[z] ?? 0;
    const seasonMins = season[pid]?.[z] ?? 0;
    const inGameBonus = gameMins === 0 ? IN_GAME_DIVERSITY : 0;
    const seasonBonus = seasonMins < FULL_QUARTER_MS ? SEASON_DIVERSITY : 0;
    const sameAsLastQ = previousQuarterZones[pid] === z ? -SAME_AS_LAST_Q : 0;
    const fairnessTerm = Math.max(0, avgPerZone - seasonMins);
    return inGameBonus + seasonBonus + sameAsLastQ + fairnessTerm;
  };

  // Primary sort key: minutes played so far this GAME, ascending.
  // The kid who's been benched all of Q1 jumps ahead of teammates
  // who played the full quarter — Steve's "those who have had the
  // least game time should have the least subs" rule.
  //
  // ATTENDANCE-HISTORY IS NOT A FACTOR. Per Steve's clarified rule:
  // "It is ok to penalise players who have missed games on total
  // game time. Over the season the split between positions should
  // be balanced, but not total game time. A player who turns up
  // every week should not be benched because another player only
  // turns up half the time." So a kid who missed last week doesn't
  // crowd out a regular today; they just rotate among today's
  // attendees on equal footing. (Position-level season fairness
  // still lives in `owed()`'s SEASON_DIVERSITY + FAIRNESS_TERM —
  // that's about WHICH ZONE, not how MUCH.)
  //
  // When `currentGame` is empty (start of Q1, simple unit tests),
  // every value is zero → ties → the seeded shuffle alone decides
  // the Q1 starting bench. Intentional: arbitrary at Q1, evens out
  // by Q4 via the in-game ms sort.
  const inGameTotal = (pid: string) => {
    let t = 0;
    for (const z of zones) t += currentGame[pid]?.[z] ?? 0;
    return t;
  };

  // For the partnership penalty: track exactly which players have already
  // been placed in each target zone. When evaluating (pid, target) we look
  // at who's currently slotted into target and apply -PARTNERSHIP_PENALTY
  // for each one that was a Q-1 cohort mate of pid. Pinned players are
  // seeded into the map below so subsequent partnership scoring sees them.
  const placedByZone: Map<Zone, Set<string>> = new Map();
  const trackPlaced = (pid: string, zone: Zone) => {
    const set = placedByZone.get(zone) ?? new Set<string>();
    set.add(pid);
    placedByZone.set(zone, set);
  };
  for (const p of availablePlayers) {
    if (!pinnedIds.has(p.id)) continue;
    const z = pinnedPositions[p.id];
    if (!z) continue;
    trackPlaced(p.id, z);
  }
  const partnershipPenaltyFor = (pid: string, target: Zone) => {
    const myMates = previousZoneTeammates[pid];
    if (!myMates || myMates.size === 0) return 0;
    const placed = placedByZone.get(target);
    if (!placed) return 0;
    let penalty = 0;
    placed.forEach((other) => {
      if (myMates.has(other)) penalty += PARTNERSHIP_PENALTY;
    });
    return penalty;
  };
  // Phase D chip-spread / chip-group penalty — driven by the same
  // placedByZone map so it sees players placed earlier in this same
  // suggester pass. Mode flips sign per chip key.
  const chipPenaltyFor = buildChipPenaltyFor(
    chipByPlayerId,
    chipModeByKey,
    placedByZone,
  );

  const remaining = availablePlayers.filter((p) => !pinnedIds.has(p.id));
  const shuffled = seededShuffle(remaining, seed + 17);
  const sortedPlayers = shuffled.sort(
    (a, b) => inGameTotal(a.id) - inGameTotal(b.id),
  );

  for (const p of sortedPlayers) {
    const openZones = zones.filter((z) => zoneFill[z] < zoneCaps[z]);
    if (openZones.length === 0) {
      lineup.bench.push(p.id);
      continue;
    }
    const shuffledZones = seededShuffle(openZones, seed + p.id.charCodeAt(0));
    shuffledZones.sort((a, b) => {
      const scoreA = owed(p.id, a) - partnershipPenaltyFor(p.id, a) - chipPenaltyFor(p.id, a);
      const scoreB = owed(p.id, b) - partnershipPenaltyFor(p.id, b) - chipPenaltyFor(p.id, b);
      const diff = scoreB - scoreA;
      if (diff !== 0) return diff;
      return zoneFill[a] - zoneFill[b];
    });
    const chosen = shuffledZones[0];
    lineup[chosen].push(p.id);
    zoneFill[chosen]++;
    trackPlaced(p.id, chosen);
  }

  return lineup;
}

// ─── Chip-spread penalty (Phase D) ────────────────────────────
// Soft constraint applied during placement so chip-mates either
// spread (default) or group together (per chip's `mode`).
//
// Split mode (default): quadratic POSITIVE penalty in the count
// already placed in the target zone. 1st same-chip = 0, 2nd = 50,
// 3rd = 200, 4th = 450. Well below IN_GAME_DIVERSITY (1000) so it
// never overrides a fresh-zone placement; acts as a tiebreaker.
//
// Group mode: same magnitude but NEGATIVE so the same-chip zone
// becomes the cheapest option. 1st = 0, 2nd = -50, 3rd = -200,
// 4th = -450. Funnels chip-mates into one zone (subject to caps).
const CHIP_PENALTY_BASE = 50;
function buildChipPenaltyFor(
  chipByPlayerId: Record<string, "a" | "b" | "c" | null | undefined>,
  chipModeByKey: Partial<Record<"a" | "b" | "c", "split" | "group">>,
  placedByZone: Map<Zone, Set<string>>,
) {
  return (pid: string, target: Zone): number => {
    const myChip = chipByPlayerId[pid];
    if (!myChip) return 0;
    const placed = placedByZone.get(target);
    if (!placed) return 0;
    let sameChip = 0;
    placed.forEach((other) => {
      if (chipByPlayerId[other] === myChip) sameChip++;
    });
    if (sameChip === 0) return 0;
    const magnitude = sameChip * sameChip * CHIP_PENALTY_BASE;
    const mode = chipModeByKey[myChip] ?? "split";
    return mode === "group" ? -magnitude : magnitude;
  };
}

// ─── Suggest the next swap during play ───────────────────────
export interface SwapSuggestion {
  off_player_id: string;
  on_player_id: string;
  zone: Zone;
  gap: number;
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

export function suggestSwaps(
  lineup: Lineup,
  currentGameMs: Record<string, number> = {},
  tieBreak: number = 0,
  injuredIds: readonly string[] = [],
  activeZoneList: Zone[] = ZONES,
  lockedIds: readonly string[] = [],
  /** Zone-level ms this game per player. Used to prefer sending incoming players
   *  to zones they haven't played yet, promoting position diversity mid-game. */
  currentGameZoneMs: Record<string, ZoneMinutes> = {},
  /** Zone-locked players: can sub on/off but must always return to this zone. */
  zoneLockedPlayers: Record<string, Zone> = {}
): SwapSuggestion[] {
  const injured = new Set(injuredIds);
  const locked = new Set(lockedIds);
  const fitBench = lineup.bench.filter((p) => !injured.has(p) && !locked.has(p));
  if (fitBench.length === 0) return [];

  const gameMin = (pid: string) => (currentGameMs[pid] ?? 0) / 60000;
  const hasPlayedZone = (pid: string, z: Zone) =>
    (currentGameZoneMs[pid]?.[z] ?? 0) > 0;

  const fieldByZone = {} as Record<Zone, string[]>;
  for (const z of ALL_ZONES) fieldByZone[z] = [];
  for (const z of activeZoneList) {
    fieldByZone[z] = seededShuffle(
      lineup[z].filter((p) => !injured.has(p) && !locked.has(p)),
      tieBreak + 131 * (ALL_ZONES.indexOf(z) + 1)
    );
    fieldByZone[z].sort((a, b) => gameMin(b) - gameMin(a));
  }
  const benchSorted = seededShuffle(fitBench, tieBreak).sort(
    (a, b) => gameMin(a) - gameMin(b)
  );

  const zoneOrder = seededShuffle(activeZoneList, tieBreak + 77);
  const zoneCursor = emptyCaps();
  const swaps: SwapSuggestion[] = [];

  for (let i = 0; i < benchSorted.length; i++) {
    const on = benchSorted[i];
    const forcedZone = zoneLockedPlayers[on] as Zone | undefined;
    let pickZone: Zone | null = null;

    if (forcedZone) {
      // Zone-locked: must come on in their locked zone only.
      if (fieldByZone[forcedZone]?.[zoneCursor[forcedZone]]) {
        pickZone = forcedZone;
      }
      if (!pickZone) continue; // no one to rotate out of that zone right now
    } else {
      // First pass: prefer a zone this player hasn't played yet this game.
      for (let k = 0; k < zoneOrder.length; k++) {
        const z = zoneOrder[(i + k) % zoneOrder.length];
        if (!hasPlayedZone(on, z) && fieldByZone[z][zoneCursor[z]]) {
          pickZone = z;
          break;
        }
      }
      // Fallback: any zone with an available player to rotate off.
      if (!pickZone) {
        for (let k = 0; k < zoneOrder.length; k++) {
          const z = zoneOrder[(i + k) % zoneOrder.length];
          if (fieldByZone[z][zoneCursor[z]]) {
            pickZone = z;
            break;
          }
        }
      }
      if (!pickZone) break; // no field players available at all — done
    }

    const off = fieldByZone[pickZone][zoneCursor[pickZone]];
    zoneCursor[pickZone]++;
    swaps.push({
      off_player_id: off,
      on_player_id: on,
      zone: pickZone,
      gap: gameMin(off) - gameMin(on),
    });
  }

  return swaps;
}

// ─── Replay events → current game state ─────────────────────
export interface QuarterScore {
  goals: number;
  behinds: number;
}
export interface GameState {
  lineup: Lineup | null;
  currentQuarter: number;
  quarterEnded: boolean;
  teamScore: { goals: number; behinds: number };
  opponentScore: { goals: number; behinds: number };
  /**
   * Per-quarter team / opponent scores. Index 1..4 for Q1..Q4
   * (index 0 reserved / unused so coach-friendly indexing maps
   * straight through). Lazily extended as quarters fire. Score
   * events outside any quarter (pre-Q1, post-Q4 retroactive
   * adds without intended_quarter) are dropped from this
   * breakdown but still counted in cumulative teamScore.
   */
  scoreByQuarter: Array<{ ours: QuarterScore; theirs: QuarterScore }>;
  playerScores: Record<string, { goals: number; behinds: number }>;
  finalised: boolean;
  basePlayedZoneMs: Record<string, ZoneMinutes>;
  stintStartMs: Record<string, number>;
  stintZone: Record<string, Zone>;
  injuredIds: string[];
  loanedIds: string[];
  loanStartMs: Record<string, number>;
  basePlayedLoanMs: Record<string, number>;
  /** ISO timestamp of the current quarter_start event; null when quarter is ended/not started. */
  quarterStartedAt: string | null;
}

// Empty per-quarter score record. Used both during replay and by the
// live store when it seeds scoreByQuarter from initialState.
function emptyQuarterScore(): { ours: QuarterScore; theirs: QuarterScore } {
  return {
    ours: { goals: 0, behinds: 0 },
    theirs: { goals: 0, behinds: 0 },
  };
}

export function replayGame(events: GameEvent[]): GameState {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
  const state: GameState = {
    lineup: null,
    currentQuarter: 0,
    quarterEnded: false,
    teamScore: { goals: 0, behinds: 0 },
    opponentScore: { goals: 0, behinds: 0 },
    scoreByQuarter: [],
    playerScores: {},
    finalised: false,
    basePlayedZoneMs: {},
    stintStartMs: {},
    stintZone: {},
    injuredIds: [],
    loanedIds: [],
    loanStartMs: {},
    basePlayedLoanMs: {},
    quarterStartedAt: null,
  };

  // Ensure scoreByQuarter[q] exists. Quarters are 1-indexed; we pad
  // index 0 with an empty slot so callers can use sBQ[1..4] directly.
  const ensureQuarter = (q: number) => {
    if (q < 1) return null;
    while (state.scoreByQuarter.length <= q) {
      state.scoreByQuarter.push(emptyQuarterScore());
    }
    return state.scoreByQuarter[q];
  };
  let quarterStartedAt: string | null = null;
  const addPlayed = (pid: string, zone: Zone, ms: number) => {
    if (ms <= 0) return;
    state.basePlayedZoneMs[pid] ??= emptyZM();
    state.basePlayedZoneMs[pid][zone] += ms;
  };
  const addLoan = (pid: string, ms: number) => {
    if (ms <= 0) return;
    state.basePlayedLoanMs[pid] = (state.basePlayedLoanMs[pid] ?? 0) + ms;
  };

  for (const ev of sorted) {
    const meta = ev.metadata as {
      lineup?: Partial<Lineup>;
      quarter?: number;
      off_player_id?: string;
      on_player_id?: string;
      zone?: Zone;
      elapsed_ms?: number;
    };
    const elapsed = meta.elapsed_ms ?? 0;

    if (ev.type === "lineup_set" && meta.lineup) {
      state.lineup = normalizeLineup(meta.lineup);
    } else if (ev.type === "quarter_start" && meta.quarter) {
      state.currentQuarter = meta.quarter;
      state.quarterEnded = false;
      // Materialise the per-quarter score slot so it exists even
      // for quarters that never see a score event.
      ensureQuarter(meta.quarter);
      quarterStartedAt = ev.created_at;
      state.stintStartMs = {};
      state.stintZone = {};
      if (state.lineup) {
        for (const z of ALL_ZONES) {
          for (const p of state.lineup[z]) {
            state.stintStartMs[p] = 0;
            state.stintZone[p] = z;
          }
        }
      }
      // Re-anchor any still-loaned players' stints to elapsed=0 in this quarter.
      for (const pid of state.loanedIds) state.loanStartMs[pid] = 0;
    } else if (ev.type === "quarter_end") {
      state.quarterEnded = true;
      quarterStartedAt = null;
      for (const [pid, start] of Object.entries(state.stintStartMs)) {
        const z = state.stintZone[pid];
        if (z) addPlayed(pid, z, elapsed - start);
      }
      state.stintStartMs = {};
      state.stintZone = {};
      // Flush open loan stints — quarter_start will reopen if still loaned.
      for (const [pid, start] of Object.entries(state.loanStartMs)) {
        addLoan(pid, elapsed - start);
      }
      state.loanStartMs = {};
    } else if (
      ev.type === "swap" &&
      state.lineup &&
      meta.on_player_id &&
      meta.zone
    ) {
      const off = meta.off_player_id ?? "";
      const on = meta.on_player_id;
      const z = meta.zone;
      if (off) {
        const offZone = state.stintZone[off] ?? z;
        addPlayed(off, offZone, elapsed - (state.stintStartMs[off] ?? 0));
        delete state.stintStartMs[off];
        delete state.stintZone[off];
        state.lineup[z] = state.lineup[z].map((p) => (p === off ? on : p));
        state.lineup.bench = [
          ...state.lineup.bench.filter((p) => p !== on),
          off,
        ];
      } else {
        state.lineup[z] = [...state.lineup[z], on];
        state.lineup.bench = state.lineup.bench.filter((p) => p !== on);
      }
      state.stintStartMs[on] = elapsed;
      state.stintZone[on] = z;
    } else if (ev.type === "field_zone_swap" && state.lineup) {
      // Two on-field players swap zones (e.g. mid ↔ fwd). Mirrors the
      // store's applyFieldZoneSwap action: close each player's open
      // stint at their CURRENT zone, then re-open at their new zone
      // post-swap. Without this branch the lineup_set/swap-driven
      // replay never reflects field-to-field rotations, so any
      // refresh that has to re-init the store from the server's
      // computed state (cold mount, restart-game reset, etc.) snaps
      // the lineup back to the un-swapped state — losing all
      // mid-quarter zone rotations the GM did via tap-tap or the
      // long-press → Switch action.
      const meta2 = ev.metadata as {
        player_a_id?: string;
        zone_a?: Zone;
        player_b_id?: string;
        zone_b?: Zone;
      };
      const pidA = meta2.player_a_id;
      const zoneA = meta2.zone_a;
      const pidB = meta2.player_b_id;
      const zoneB = meta2.zone_b;
      if (pidA && zoneA && pidB && zoneB) {
        // Close both open stints at their current zones (using the
        // store's stintZone fallback for safety — defaults to the
        // event's recorded zone if stintZone isn't tracking them).
        for (const [pid, fromZone] of [
          [pidA, zoneA],
          [pidB, zoneB],
        ] as [string, Zone][]) {
          const fromZ = state.stintZone[pid] ?? fromZone;
          addPlayed(pid, fromZ, elapsed - (state.stintStartMs[pid] ?? 0));
        }
        // Swap the two players in the lineup arrays.
        state.lineup[zoneA] = state.lineup[zoneA].map((p) =>
          p === pidA ? pidB : p,
        );
        state.lineup[zoneB] = state.lineup[zoneB].map((p) =>
          p === pidB ? pidA : p,
        );
        // Open new stints at the swapped zones.
        state.stintStartMs[pidA] = elapsed;
        state.stintZone[pidA] = zoneB;
        state.stintStartMs[pidB] = elapsed;
        state.stintZone[pidB] = zoneA;
      }
    } else if (ev.type === "player_arrived" && state.lineup && ev.player_id) {
      if (!state.lineup.bench.includes(ev.player_id)) {
        state.lineup.bench.push(ev.player_id);
      }
    } else if (ev.type === "injury" && state.lineup && ev.player_id) {
      const pid = ev.player_id;
      const injured = (ev.metadata as { injured?: boolean }).injured ?? true;
      if (injured) {
        if (!state.injuredIds.includes(pid)) state.injuredIds.push(pid);
        const z = zoneOf(state.lineup, pid);
        if (z) {
          const sz = state.stintZone[pid] ?? z;
          addPlayed(pid, sz, elapsed - (state.stintStartMs[pid] ?? 0));
          delete state.stintStartMs[pid];
          delete state.stintZone[pid];
          state.lineup[z] = state.lineup[z].filter((p) => p !== pid);
          if (!state.lineup.bench.includes(pid)) state.lineup.bench.push(pid);
        }
      } else {
        state.injuredIds = state.injuredIds.filter((p) => p !== pid);
      }
    } else if (ev.type === "player_loan" && state.lineup && ev.player_id) {
      const pid = ev.player_id;
      const loaned = (ev.metadata as { loaned?: boolean }).loaned ?? true;
      if (loaned) {
        if (!state.loanedIds.includes(pid)) state.loanedIds.push(pid);
        state.loanStartMs[pid] = elapsed;
        const z = zoneOf(state.lineup, pid);
        if (z) {
          const sz = state.stintZone[pid] ?? z;
          addPlayed(pid, sz, elapsed - (state.stintStartMs[pid] ?? 0));
          delete state.stintStartMs[pid];
          delete state.stintZone[pid];
          state.lineup[z] = state.lineup[z].filter((p) => p !== pid);
          if (!state.lineup.bench.includes(pid)) state.lineup.bench.push(pid);
        }
      } else {
        state.loanedIds = state.loanedIds.filter((p) => p !== pid);
        const start = state.loanStartMs[pid];
        if (start !== undefined) {
          addLoan(pid, elapsed - start);
          delete state.loanStartMs[pid];
        }
      }
    } else if (ev.type === "goal") {
      state.teamScore.goals++;
      if (ev.player_id) {
        state.playerScores[ev.player_id] ??= { goals: 0, behinds: 0 };
        state.playerScores[ev.player_id].goals++;
      }
      // Attribute to a specific quarter — coach-supplied
      // `intended_quarter` (set by retroactive add) wins over the
      // current replay quarter so a goal added at full-time gets
      // booked back to the period it actually happened in.
      const meta3 = ev.metadata as { intended_quarter?: number } | null;
      const q = meta3?.intended_quarter ?? state.currentQuarter;
      const slot = ensureQuarter(q);
      if (slot) slot.ours.goals++;
    } else if (ev.type === "behind") {
      state.teamScore.behinds++;
      if (ev.player_id) {
        state.playerScores[ev.player_id] ??= { goals: 0, behinds: 0 };
        state.playerScores[ev.player_id].behinds++;
      }
      const meta3 = ev.metadata as { intended_quarter?: number } | null;
      const q = meta3?.intended_quarter ?? state.currentQuarter;
      const slot = ensureQuarter(q);
      if (slot) slot.ours.behinds++;
    } else if (ev.type === "opponent_goal") {
      state.opponentScore.goals++;
      const meta3 = ev.metadata as { intended_quarter?: number } | null;
      const q = meta3?.intended_quarter ?? state.currentQuarter;
      const slot = ensureQuarter(q);
      if (slot) slot.theirs.goals++;
    } else if (ev.type === "opponent_behind") {
      state.opponentScore.behinds++;
      const meta3 = ev.metadata as { intended_quarter?: number } | null;
      const q = meta3?.intended_quarter ?? state.currentQuarter;
      const slot = ensureQuarter(q);
      if (slot) slot.theirs.behinds++;
    } else if (ev.type === "score_undo") {
      // Decrement the counter the original event incremented. Mirrors
      // the proven logic in src/lib/dashboard/eventReplay.ts:277-310.
      // The undo metadata carries `original_type` (the event type
      // being reversed) and `quarter` (the period the original was
      // booked to — written by undoLastScore, may differ from the
      // replay's currentQuarter for retroactive deletions).
      const meta3 = ev.metadata as {
        original_type?: string;
        quarter?: number;
      } | null;
      const orig = meta3?.original_type;
      const q = meta3?.quarter ?? state.currentQuarter;
      const slot = q >= 1 && q < state.scoreByQuarter.length
        ? state.scoreByQuarter[q]
        : null;
      const pid = ev.player_id;
      if (orig === "goal") {
        state.teamScore.goals = Math.max(0, state.teamScore.goals - 1);
        if (pid && state.playerScores[pid]) {
          state.playerScores[pid].goals = Math.max(0, state.playerScores[pid].goals - 1);
        }
        if (slot) slot.ours.goals = Math.max(0, slot.ours.goals - 1);
      } else if (orig === "behind") {
        state.teamScore.behinds = Math.max(0, state.teamScore.behinds - 1);
        if (pid && state.playerScores[pid]) {
          state.playerScores[pid].behinds = Math.max(0, state.playerScores[pid].behinds - 1);
        }
        if (slot) slot.ours.behinds = Math.max(0, slot.ours.behinds - 1);
      } else if (orig === "opponent_goal") {
        state.opponentScore.goals = Math.max(0, state.opponentScore.goals - 1);
        if (slot) slot.theirs.goals = Math.max(0, slot.theirs.goals - 1);
      } else if (orig === "opponent_behind") {
        state.opponentScore.behinds = Math.max(0, state.opponentScore.behinds - 1);
        if (slot) slot.theirs.behinds = Math.max(0, slot.theirs.behinds - 1);
      }
    } else if (ev.type === "game_finalised") {
      state.finalised = true;
      // Close any open loan stints so final totals are correct.
      for (const [pid, start] of Object.entries(state.loanStartMs)) {
        addLoan(pid, elapsed - start);
      }
      state.loanStartMs = {};
    }
  }

  if (state.lineup) state.lineup = normalizeLineup(state.lineup);
  state.quarterStartedAt = quarterStartedAt;

  return state;
}

// ─── Fairness score 0-100 ────────────────────────────────────
export function fairnessScore(season: PlayerZoneMinutes): number {
  const values: number[] = [];
  for (const zm of Object.values(season)) {
    for (const z of ALL_ZONES) {
      if (zm[z] > 0) values.push(zm[z]);
    }
  }
  if (values.length === 0) return 100;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 100;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
}
