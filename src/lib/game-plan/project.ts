// ─── Pre-game rotation plan — projectors ─────────────────────
// Pure functions that loop each sport's fairness suggester across
// every period of a game to produce a sport-agnostic `GamePlan`.
//
// No Supabase, no React, no clock — this is the planning-time mirror
// of the live Q-break suggester. AFL and netball reuse their existing
// engines verbatim (looped, feeding each period's projected lineup
// forward as the "previous quarter" state). Rugby league has no
// suggester, so we add a small block-based bench-fair rotation
// projector here that honours `forwardCount` + `minUnbrokenPeriods`.

import {
  suggestStartingLineup,
  seasonZoneMinutes,
  zoneCapsFor,
  zoneTeammatesFromLineup,
  ALL_ZONES,
  emptyZoneMs,
  type ZoneCaps,
  type PlayerZoneMinutes,
} from "@/lib/fairness";
import {
  suggestNetballLineup,
  seasonPositionCounts,
  type PlayerPositionCounts,
  type GenericLineup,
  type ThirdLookup,
} from "@/lib/sports/netball/fairness";
import { pickNetballPositionsToFill, primaryThirdFor } from "@/lib/sports/netball";
import { getSportConfig } from "@/lib/sports/registry";
import type { AgeGroupConfig, SportConfig } from "@/lib/sports/types";
import type { Lineup, Player, PlayerChip, Zone, PositionModel } from "@/lib/types";
import type {
  GamePlan,
  GamePlanGroup,
  GamePlanPeriod,
  GamePlanPlayerTotal,
  ProjectGamePlanInput,
} from "./types";

// ─── Small deterministic shuffle (local; engine ones aren't exported) ──
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

function periodShortLabel(label: "quarter" | "half" | "period"): string {
  return label === "half" ? "H" : label === "period" ? "P" : "Q";
}

function clampOnField(ageGroup: AgeGroupConfig, onFieldSize: number): number {
  return Math.max(
    ageGroup.minOnFieldSize,
    Math.min(ageGroup.maxOnFieldSize, Math.floor(onFieldSize)),
  );
}

function resolvePeriodLabels(
  cfg: SportConfig,
  ageGroup: AgeGroupConfig,
): { label: "quarter" | "half" | "period"; plural: "quarters" | "halves" | "periods" } {
  return {
    label: ageGroup.periodLabel ?? cfg.periodLabel,
    plural: ageGroup.periodLabelPlural ?? cfg.periodLabelPlural,
  };
}

// Per-player start tally across the projected periods: how many periods
// each player begins on the field. Every input player appears —
// including those who never get on — so the coach can see imbalance at
// a glance before kickoff. The plan is about who is where each period,
// not minutes-per-kid, so we don't project game time.
//
// Exported so the manual-tweak helper (./edit) can recompute the tally
// after a coach swaps two players, without duplicating the sort logic.
export function computeTotals(
  periods: GamePlanPeriod[],
  allPlayerIds: string[],
): GamePlanPlayerTotal[] {
  const onFieldCount: Record<string, number> = {};
  for (const id of allPlayerIds) onFieldCount[id] = 0;
  for (const p of periods) {
    for (const g of p.groups) {
      for (const pid of g.playerIds) {
        onFieldCount[pid] = (onFieldCount[pid] ?? 0) + 1;
      }
    }
  }
  return allPlayerIds
    .map((playerId) => ({
      playerId,
      periodsOnField: onFieldCount[playerId] ?? 0,
    }))
    .sort((a, b) => b.periodsOnField - a.periodsOnField);
}

// Sum a player's banked on-field ms across all zones — drives the
// interchange queue order (fewest minutes banked → comes on first).
function totalBankedMs(zoneMs: Record<string, number> | undefined): number {
  if (!zoneMs) return 0;
  let sum = 0;
  for (const z of ALL_ZONES) sum += zoneMs[z] ?? 0;
  return sum;
}

function resolveChips(input: ProjectGamePlanInput): {
  chipByPlayerId: Record<string, PlayerChip | null | undefined>;
  chipModeByKey: NonNullable<ProjectGamePlanInput["chipModeByKey"]>;
} {
  const chipByPlayerId =
    input.chipByPlayerId ??
    Object.fromEntries(input.players.map((p) => [p.id, p.chip ?? null]));
  return { chipByPlayerId, chipModeByKey: input.chipModeByKey ?? {} };
}

// ─── AFL — loop the zone-minutes suggester across quarters ───
function projectAflGamePlan(input: ProjectGamePlanInput): GamePlan {
  const cfg = getSportConfig("afl");
  const ag = input.ageGroup;
  const periodCount = input.periodCount ?? ag.periodCount;
  const periodMinutes = input.periodMinutes ?? ag.periodSeconds / 60;
  const onFieldSize = clampOnField(ag, input.onFieldSize);
  const { label, plural } = resolvePeriodLabels(cfg, ag);
  const short = periodShortLabel(label);

  // Rolling subs only bite when there's a bench to rotate. A short
  // squad (everyone on every period) plays whole periods — no queue, no
  // minute correction — so it keeps the plain whole-period totals.
  const rotates = input.players.length > onFieldSize;

  const model: PositionModel = ag.zones.length >= 5 ? "positions5" : "zones3";
  const zoneCaps: ZoneCaps = zoneCapsFor(onFieldSize, model);
  const season: PlayerZoneMinutes = seasonZoneMinutes(input.seasonEvents ?? []);
  const { chipByPlayerId, chipModeByKey } = resolveChips(input);
  // The suggester only reads `.id` off each player; the slim shape is fine.
  const players = input.players as unknown as Player[];

  // Active zones (caps > 0), in the age-group's canonical order. Used to
  // build the per-period group rows and to label them via the sport config.
  const activeZones = (ag.zones as Zone[]).filter((z) => (zoneCaps[z] ?? 0) > 0);
  const zoneLabel = (zoneId: string) =>
    cfg.zones.find((z) => z.id === zoneId)?.label ?? zoneId;

  const currentGame: PlayerZoneMinutes = {};
  let prevLineup: Lineup | null = null;
  const periods: GamePlanPeriod[] = [];

  for (let q = 1; q <= periodCount; q++) {
    const previousQuarterZones: Record<string, Zone> = {};
    if (prevLineup) {
      for (const z of ALL_ZONES) {
        for (const pid of prevLineup[z]) previousQuarterZones[pid] = z;
      }
    }
    const previousZoneTeammates = prevLineup
      ? zoneTeammatesFromLineup(prevLineup)
      : {};

    const lineup = suggestStartingLineup(
      players,
      season,
      (input.seed ?? 0) + q,
      zoneCaps,
      currentGame,
      {},
      previousQuarterZones,
      previousZoneTeammates,
      {},
      chipByPlayerId,
      chipModeByKey,
    );

    // Accumulate this quarter's whole-period minutes so the next
    // quarter's IN_GAME_DIVERSITY bonus rotates each kid to a fresh zone
    // and benched players climb the who-plays sort.
    for (const z of ALL_ZONES) {
      for (const pid of lineup[z]) {
        currentGame[pid] ??= emptyZoneMs();
        currentGame[pid][z] += periodMinutes;
      }
    }

    const groups: GamePlanGroup[] = activeZones.map((z) => ({
      groupId: z,
      groupLabel: zoneLabel(z),
      playerIds: [...lineup[z]],
    }));

    // Interchange queue: order the bench fewest-minutes-banked first so
    // the kid most owed game time comes on first when a sub falls due.
    // (currentGame already holds this quarter for on-field players; bench
    // players reflect their prior-quarter minutes only.) Q1 ties keep the
    // suggester's order via the stable sort.
    const bench = rotates
      ? [...lineup.bench].sort(
          (a, b) => totalBankedMs(currentGame[a]) - totalBankedMs(currentGame[b]),
        )
      : [...lineup.bench];

    periods.push({
      period: q,
      label: `${short}${q}`,
      groups,
      bench,
    });
    prevLineup = lineup;
  }

  const playerIds = input.players.map((p) => p.id);
  return {
    sport: "afl",
    periods,
    totals: computeTotals(periods, playerIds),
    periodLabel: label,
    periodLabelPlural: plural,
    periodMinutes,
    rotatesWithinPeriod: rotates,
    subIntervalSeconds: rotates ? ag.subIntervalSeconds : undefined,
  };
}

// ─── Netball helpers — derive "previous quarter" state from a lineup ──
// Pre-game has no events, so the inputs that the live suggester reads
// from the event log (last-quarter third, last-quarter teammates) are
// instead derived from the previously PROJECTED lineup.
function netballThirdsFromLineup(
  lineup: GenericLineup,
  thirdOf: ThirdLookup,
): Record<string, "attack-third" | "centre-third" | "defence-third"> {
  const out: Record<string, "attack-third" | "centre-third" | "defence-third"> = {};
  for (const [posId, ids] of Object.entries(lineup.positions)) {
    const t = thirdOf(posId);
    if (!t) continue;
    for (const pid of ids) if (pid) out[pid] = t;
  }
  return out;
}

function netballTeammatesFromLineup(
  lineup: GenericLineup,
  thirdOf: ThirdLookup,
): Record<string, Set<string>> {
  const cohorts: Record<string, string[]> = {};
  for (const [posId, ids] of Object.entries(lineup.positions)) {
    const t = thirdOf(posId);
    if (!t) continue;
    const list = cohorts[t] ?? [];
    for (const pid of ids) if (pid) list.push(pid);
    cohorts[t] = list;
  }
  const bench = (lineup.bench ?? []).filter(Boolean);
  if (bench.length > 0) cohorts["bench"] = bench;
  const out: Record<string, Set<string>> = {};
  for (const ids of Object.values(cohorts)) {
    for (const pid of ids) {
      const set = new Set<string>();
      for (const other of ids) if (other !== pid) set.add(other);
      out[pid] = set;
    }
  }
  return out;
}

// ─── Netball — loop the position-count suggester across quarters ──
function projectNetballGamePlan(input: ProjectGamePlanInput): GamePlan {
  const cfg = getSportConfig("netball");
  const ag = input.ageGroup;
  const periodCount = input.periodCount ?? ag.periodCount;
  const periodMinutes = input.periodMinutes ?? ag.periodSeconds / 60;
  const periodMs = periodMinutes * 60_000;
  const onFieldSize = clampOnField(ag, input.onFieldSize);
  const { label, plural } = resolvePeriodLabels(cfg, ag);
  const short = periodShortLabel(label);

  const positions = pickNetballPositionsToFill(ag, onFieldSize);
  const thirdOf = primaryThirdFor as ThirdLookup;
  const season: PlayerPositionCounts = seasonPositionCounts(input.seasonEvents ?? []);
  const { chipByPlayerId, chipModeByKey } = resolveChips(input);
  const playerIds = input.players.map((p) => p.id);
  const posLabel = (posId: string) =>
    cfg.allPositions.find((p) => p.id === posId)?.shortLabel ?? posId;

  const thisGame: PlayerPositionCounts = {};
  const thisGameTotalMs: Record<string, number> = {};
  let prevLineup: GenericLineup | null = null;
  const periods: GamePlanPeriod[] = [];

  for (let q = 1; q <= periodCount; q++) {
    const lastQuarterThird = prevLineup
      ? netballThirdsFromLineup(prevLineup, thirdOf)
      : {};
    const previousTeammates = prevLineup
      ? netballTeammatesFromLineup(prevLineup, thirdOf)
      : {};

    const lineup = suggestNetballLineup({
      playerIds,
      positions,
      season,
      thisGame,
      isAllowed: (_pid, posId) => positions.includes(posId),
      seed: (input.seed ?? 0) + q,
      thirdOf,
      lastQuarterThird,
      previousTeammates,
      thisGameTotalMs,
      chipByPlayerId,
      chipModeByKey,
    });

    // Accumulate appearance counts + on-court ms so the next quarter
    // rotates positions / thirds and benched players get court priority.
    for (const [posId, ids] of Object.entries(lineup.positions)) {
      for (const pid of ids) {
        if (!pid) continue;
        thisGame[pid] ??= {};
        thisGame[pid][posId] = (thisGame[pid][posId] ?? 0) + 1;
        thisGameTotalMs[pid] = (thisGameTotalMs[pid] ?? 0) + periodMs;
      }
    }

    const groups: GamePlanGroup[] = positions.map((posId) => ({
      groupId: posId,
      groupLabel: posLabel(posId),
      playerIds: [...(lineup.positions[posId] ?? [])],
    }));

    periods.push({
      period: q,
      label: `${short}${q}`,
      groups,
      bench: [...lineup.bench],
    });
    prevLineup = lineup;
  }

  return {
    sport: "netball",
    periods,
    totals: computeTotals(periods, playerIds),
    periodLabel: label,
    periodLabelPlural: plural,
    periodMinutes,
    // Netball subs only at period breaks — whole-period blocks are real.
    rotatesWithinPeriod: false,
  };
}

// ─── Rugby league — block-based bench-fair rotation ──────────
// No fairness suggester exists for junior RL (it's positionless
// interchange). We project a fair rotation directly:
//
//   • Periods are grouped into blocks of `minUnbrokenPeriods`
//     consecutive periods (U6–U9: 2 quarters per block → 2 blocks;
//     U10–U12: 1 half per block → 2 blocks). The same on-field set
//     plays the whole block, which satisfies the Law 6 "unbroken
//     period" rule by construction.
//   • Across blocks the on-field set rotates: each block we pick the
//     players with the FEWEST periods banked so far, so bench time
//     spreads evenly over the game.
//   • The on-field set is split into forwards / backs using the
//     age-group's `forwardCount`; the split is re-shuffled per block
//     so a kid isn't always a forward.
function projectLeagueGamePlan(input: ProjectGamePlanInput): GamePlan {
  const cfg = getSportConfig("rugby_league");
  const ag = input.ageGroup;
  const periodCount = input.periodCount ?? ag.periodCount;
  const periodMinutes = input.periodMinutes ?? ag.periodSeconds / 60;
  const onFieldSize = clampOnField(ag, input.onFieldSize);
  const { label, plural } = resolvePeriodLabels(cfg, ag);
  const short = periodShortLabel(label);

  const ids = input.players.map((p) => p.id);
  const seed = input.seed ?? 0;
  const fwdCount = Math.min(
    onFieldSize,
    ag.forwardCount ?? Math.floor(onFieldSize / 2),
  );
  const blockSize = Math.max(1, ag.minUnbrokenPeriods ?? 1);

  const periodsPlayed: Record<string, number> = {};
  for (const id of ids) periodsPlayed[id] = 0;

  const periods: GamePlanPeriod[] = [];
  let p = 1;
  let blockIndex = 0;

  while (p <= periodCount) {
    const periodsInBlock = Math.min(blockSize, periodCount - p + 1);

    // Choose this block's on-field set: fewest periods banked first,
    // seeded shuffle to break ties deterministically.
    const ordered = seededShuffle(ids, seed + 101 + blockIndex).sort(
      (a, b) => periodsPlayed[a] - periodsPlayed[b],
    );
    const onFieldIds = ordered.slice(0, onFieldSize);
    const benchIds = ordered.slice(onFieldSize);

    // Split forwards / backs; re-shuffle per block so the same kids
    // aren't always forwards.
    const splitShuffled = seededShuffle(onFieldIds, seed + 211 + blockIndex);
    const forwards = splitShuffled.slice(0, fwdCount);
    const backs = splitShuffled.slice(fwdCount);

    for (let k = 0; k < periodsInBlock; k++) {
      periods.push({
        period: p + k,
        label: `${short}${p + k}`,
        groups: [
          { groupId: "forwards", groupLabel: "Forwards", playerIds: [...forwards] },
          { groupId: "backs", groupLabel: "Backs", playerIds: [...backs] },
        ],
        bench: [...benchIds],
      });
    }

    for (const id of onFieldIds) periodsPlayed[id] += periodsInBlock;
    p += periodsInBlock;
    blockIndex++;
  }

  return {
    sport: "rugby_league",
    periods,
    totals: computeTotals(periods, ids),
    periodLabel: label,
    periodLabelPlural: plural,
    periodMinutes,
    // Law-6 unbroken blocks: the on-field set holds for a whole block,
    // so whole-period blocks are the real planning unit (no within-block
    // interchange to model).
    rotatesWithinPeriod: false,
  };
}

/**
 * Project a full-game rotation plan for any sport. Dispatches to the
 * right per-sport projector. Pure — safe to call from a client
 * component on every tweak / reshuffle.
 */
export function projectGamePlan(input: ProjectGamePlanInput): GamePlan {
  switch (input.sport) {
    case "netball":
      return projectNetballGamePlan(input);
    case "rugby_league":
      return projectLeagueGamePlan(input);
    case "afl":
    default:
      return projectAflGamePlan(input);
  }
}
