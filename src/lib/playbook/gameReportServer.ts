// Builds the "How we played" report for a finished game (UX plan 4.4)
// from its events, the How we play it kicked off with, and the season
// before it. Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { replayGame } from "@/lib/fairness";
import { playedZoneMsByPeriod as netballByPeriod } from "@/lib/sports/netball/fairness";
import { playedZoneMsByPeriod as leagueByPeriod } from "@/lib/sports/rugby_league/fairness";
import { primaryThirdFor } from "@/lib/sports/netball";
import {
  getAgeGroupConfig,
  getEffectiveQuarterSeconds,
  isBasketball,
  isRugby,
  isSoccer,
  isTouch,
  periodLabels,
  sportNotBuilt,
  teamSport,
} from "@/lib/sports";
import { replaySoccerGame } from "@/lib/sports/soccer/replay";
import { replayBasketballGame } from "@/lib/sports/basketball/replay";
import { soccerAgeGroup } from "@/lib/sports/soccer";
import { basketballAgeGroupForTeam } from "@/lib/sports/basketball";
import { getSeasonEvents } from "@/lib/season";
import { loadTeamPlaybook } from "@/lib/playbook/load";
import { effectiveStrategy, getSportPlaybook } from "@/lib/playbook";
import { rolesFromPrefs } from "@/lib/playbook/roles";
import { gridUnits } from "@/lib/playbook/seasonGrid";
import { seasonTimeByUnit } from "@/lib/playbook/seasonTime";
import { gameReport, type GameReport } from "@/lib/playbook/gameReport";
import { rulesForSport, type RuleInstance } from "@/lib/playbook/rules";
import type { ThirdLookup } from "@/lib/sports/netball/fairness";
import type { Game, GameEvent, Sport } from "@/lib/types";
import { presentPlayerIds } from "@/lib/live/presentPlayers";

const AFL_LINE: Record<string, string> = { back: "back", hback: "back", mid: "mid", hfwd: "fwd", fwd: "fwd" };
const LABELS: Record<string, string> = {
  back: "Back",
  mid: "Centre",
  fwd: "Forward",
  "attack-third": "Attack",
  "centre-third": "Centre",
  "defence-third": "Defence",
};
/** Soccer's own words: its "mid" is midfield, never AFL's centre. */
const SOCCER_LABELS: Record<string, string> = {
  gk: "Keeper",
  def: "Defence",
  mid: "Midfield",
  att: "Attack",
  field: "Field",
};

const BASKETBALL_LABELS: Record<string, string> = {
  guard: "Guards",
  forward: "Forwards",
  court: "Court",
};

/** Whether the after-game report compares season balance, per sport. */
const SEASON_IN_REPORT: Record<Sport, boolean> = {
  afl: true,
  netball: true,
  rugby_league: false,
  rugby_union: false,
  soccer: true,
  basketball: true,
  futsal: true,
  hockey: true,
  touch: true,
  oztag: true,
};

export async function buildGameReport(
  supabase: SupabaseClient<any, any, any>,
  team: {
    id: string;
    sport: Sport | null;
    age_group: string | null;
    quarter_length_seconds: number | null;
    /** Basketball: halves or quarters (migration 0069). */
    period_count?: number | null;
  },
  game: Game,
  events: GameEvent[],
  playerNames: Record<string, string>,
): Promise<GameReport | null> {
  if (events.length === 0) return null;
  const sport = teamSport(team.sport);
  // Basketball plays the team's halves or quarters.
  const ageCfg = isBasketball(sport)
    ? basketballAgeGroupForTeam(team.age_group, team.period_count)
    : getAgeGroupConfig(sport, team.age_group);
  const periods = periodLabels(sport, ageCfg);
  const periodSeconds = getEffectiveQuarterSeconds(
    { quarter_length_seconds: team.quarter_length_seconds },
    ageCfg,
    { quarter_length_seconds: game.quarter_length_seconds },
  );
  const { resolved, prefs, rules: currentRules } = await loadTeamPlaybook(supabase, team.id, sport, team.age_group);
  const snapshot = game.playbook_snapshot ?? null;
  // Only rules this sport acts on (a snapshot from before may hold others).
  const rules: RuleInstance[] = rulesForSport(snapshot?.rules ?? currentRules, resolved);

  // ms per player → period → line.
  const byPeriod: Record<string, Record<number, Record<string, number>>> = {};
  let lines: string[];
  if (sport === "afl") {
    lines = ["back", "mid", "fwd"];
    for (const [pid, periods] of Object.entries(replayGame(events).playedZoneMsByPeriod)) {
      for (const [p, zm] of Object.entries(periods)) {
        for (const [z, ms] of Object.entries(zm)) {
          if (!(ms > 0)) continue;
          byPeriod[pid] ??= {};
          byPeriod[pid][Number(p)] ??= {};
          const line = AFL_LINE[z];
          byPeriod[pid][Number(p)][line] = (byPeriod[pid][Number(p)][line] ?? 0) + ms;
        }
      }
    }
  } else if (sport === "netball") {
    lines = ["attack-third", "centre-third", "defence-third"];
    Object.assign(byPeriod, netballByPeriod(events, periodSeconds, primaryThirdFor as ThirdLookup));
  } else if (isRugby(sport)) {
    // League time per period has no lines yet (Phase 5.6): the report
    // shows the game-time floor. League's one catalogue rule (subs at
    // the breaks) has nothing to report after the game.
    lines = ["field"];
    Object.assign(byPeriod, leagueByPeriod(events));
  } else if (isSoccer(sport)) {
    // Time in each line and in goal, per half, from soccer's replay. 4 a
    // side plays one line ("field") and no keeper.
    lines = soccerAgeGroup(ageCfg.id).keeper === "none" ? ["field"] : ["gk", "def", "mid", "att"];
    for (const [pid, periods] of Object.entries(replaySoccerGame(events).msByPeriod)) {
      for (const [p, units] of Object.entries(periods)) {
        for (const [u, ms] of Object.entries(units)) {
          if (!(ms && ms > 0)) continue;
          byPeriod[pid] ??= {};
          byPeriod[pid][Number(p)] ??= {};
          byPeriod[pid][Number(p)][u] = (byPeriod[pid][Number(p)][u] ?? 0) + ms;
        }
      }
    }
  } else if (isBasketball(sport)) {
    // Time in each line, per period, from basketball's replay: guards
    // and forwards, or the court under Equal minutes (no positions).
    const r = replayBasketballGame(events);
    const used = new Set<string>();
    for (const [pid, periods] of Object.entries(r.msByPeriod)) {
      for (const [p, units] of Object.entries(periods)) {
        for (const [u, ms] of Object.entries(units)) {
          if (!(ms && ms > 0)) continue;
          used.add(u);
          byPeriod[pid] ??= {};
          byPeriod[pid][Number(p)] ??= {};
          byPeriod[pid][Number(p)][u] = (byPeriod[pid][Number(p)][u] ?? 0) + ms;
        }
      }
    }
    lines = used.has("guard") || used.has("forward") ? ["guard", "forward"] : ["court"];
  } else if (isTouch(sport)) {
    // Touch and Oztag's replay comes with their engine (four-sports plan, track B).
    return sportNotBuilt(sport, "buildGameReport");
  } else {
    const unknown: never = sport;
    throw new Error(`No game report for sport "${String(unknown)}"`);
  }

  // Season balance, when it was on: the season before this game vs after.
  const balance = snapshot?.seasonBalance ?? resolved.seasonBalance;
  let season: { before: ReturnType<typeof seasonTimeByUnit>; after: ReturnType<typeof seasonTimeByUnit>; units: string[] } | undefined;
  if (balance !== "off" && SEASON_IN_REPORT[sport]) {
    const all = await getSeasonEvents(team.id);
    const finalised = new Set(all.filter((e) => e.type === "game_finalised").map((e) => e.game_id));
    const start = events.reduce((m, e) => (e.created_at < m ? e.created_at : m), events[0].created_at);
    const firstOf = new Map<string, string>();
    for (const e of all) {
      const cur = firstOf.get(e.game_id);
      if (!cur || e.created_at < cur) firstOf.set(e.game_id, e.created_at);
    }
    const before = all.filter((e) => e.game_id !== game.id && finalised.has(e.game_id) && (firstOf.get(e.game_id) ?? "") < start);
    const since = snapshot?.seasonBalanceSince ?? resolved.seasonBalanceSince;
    // The unit the strategy this game kicked off with balances.
    const strategyUnit = snapshot
      ? effectiveStrategy(sport, snapshot.policy, snapshot.strategy).balanceUnit
      : resolved.strategy.balanceUnit;
    const { unit, columns } = gridUnits(sport, strategyUnit, snapshot?.positions ?? resolved.positions);
    season = {
      before: seasonTimeByUnit(sport, before, unit, { since, periodSeconds }),
      after: seasonTimeByUnit(sport, [...before, ...events], unit, { since, periodSeconds }),
      units: columns.map((c) => c.key),
    };
  }

  const homeLine: Record<string, string | null> = {};
  for (const [pid, r] of Object.entries(rolesFromPrefs(prefs, "line"))) homeLine[pid] = r.home;

  // Everyone at the game: every lineup (any sport's shape) and arrival.
  // League position slots are keys, not kids (presentPlayerIds).
  const present = presentPlayerIds(events);

  // How long each period ran, from its hooter (the latest, if re-ended).
  const periodPlayedMs: Record<number, number> = {};
  for (const e of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (e.type !== "quarter_end") continue;
    const m = e.metadata as { quarter?: number; elapsed_ms?: number };
    if (typeof m.quarter === "number" && typeof m.elapsed_ms === "number") periodPlayedMs[m.quarter] = m.elapsed_ms;
  }

  return gameReport({
    byPeriod,
    present,
    periodPlayedMs,
    lines,
    lineLabel: (k) => (isSoccer(sport) ? SOCCER_LABELS[k] : isBasketball(sport) ? BASKETBALL_LABELS[k] : LABELS[k]) ?? k,
    lineWord: getSportPlaybook(sport).unitWord,
    periodLabel: (n) => (periods.label === "quarter" ? `Q${n}` : `${periods.label} ${n}`),
    periodCount: ageCfg.periodCount,
    periodMs: periodSeconds * 1000,
    minGameTimePct: snapshot?.policy.minGameTimePct ?? resolved.policy.minGameTimePct,
    rules,
    name: (pid) => playerNames[pid] ?? "A fill-in",
    homeLine,
    season,
  });
}
