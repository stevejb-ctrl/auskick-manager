// Builds the "How we played" report for a finished game (UX plan 4.4)
// from its events, the How we play it kicked off with, and the season
// before it. Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { replayGame } from "@/lib/fairness";
import { playedZoneMsByPeriod as netballByPeriod } from "@/lib/sports/netball/fairness";
import { playedZoneMsByPeriod as leagueByPeriod } from "@/lib/sports/rugby_league/fairness";
import { primaryThirdFor } from "@/lib/sports/netball";
import { getAgeGroupConfig, getEffectiveQuarterSeconds } from "@/lib/sports";
import { getSeasonEvents } from "@/lib/season";
import { loadTeamPlaybook } from "@/lib/playbook/load";
import { effectiveStrategy } from "@/lib/playbook";
import { rolesFromPrefs } from "@/lib/playbook/roles";
import { gridUnits } from "@/lib/playbook/seasonGrid";
import { seasonTimeByUnit } from "@/lib/playbook/seasonTime";
import { gameReport, type GameReport } from "@/lib/playbook/gameReport";
import type { RuleInstance } from "@/lib/playbook/rules";
import type { ThirdLookup } from "@/lib/sports/netball/fairness";
import type { Game, GameEvent, Sport } from "@/lib/types";

const AFL_LINE: Record<string, string> = { back: "back", hback: "back", mid: "mid", hfwd: "fwd", fwd: "fwd" };
const LABELS: Record<string, string> = {
  back: "Back",
  mid: "Centre",
  fwd: "Forward",
  "attack-third": "Attack",
  "centre-third": "Centre",
  "defence-third": "Defence",
};

export async function buildGameReport(
  supabase: SupabaseClient<any, any, any>,
  team: { id: string; sport: Sport | null; age_group: string | null; quarter_length_seconds: number | null },
  game: Game,
  events: GameEvent[],
  playerNames: Record<string, string>,
): Promise<GameReport | null> {
  if (events.length === 0) return null;
  const sport = (team.sport ?? "afl") as Sport;
  const ageCfg = getAgeGroupConfig(sport, team.age_group);
  const periodSeconds = getEffectiveQuarterSeconds(
    { quarter_length_seconds: team.quarter_length_seconds },
    ageCfg,
    { quarter_length_seconds: game.quarter_length_seconds },
  );
  const { resolved, prefs, rules: currentRules } = await loadTeamPlaybook(supabase, team.id, sport, team.age_group);
  const snapshot = game.playbook_snapshot ?? null;
  let rules: RuleInstance[] = snapshot?.rules ?? currentRules;

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
  } else {
    // League time per period has no lines yet (Phase 5.6): report the
    // game-time floor and the sit-out rule only.
    lines = ["field"];
    Object.assign(byPeriod, leagueByPeriod(events));
    rules = rules.filter((r) => r.kind === "max-bench-in-row");
  }

  // Season balance, when it was on: the season before this game vs after.
  const balance = snapshot?.seasonBalance ?? resolved.seasonBalance;
  let season: { before: ReturnType<typeof seasonTimeByUnit>; after: ReturnType<typeof seasonTimeByUnit>; units: string[] } | undefined;
  if (balance !== "off" && sport !== "rugby_league") {
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
  const present = new Set<string>();
  const collect = (v: unknown) => {
    if (typeof v === "string") present.add(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") Object.values(v).forEach(collect);
  };
  for (const e of events) {
    if (e.type === "lineup_set" || e.type === "period_break_swap") collect((e.metadata as { lineup?: unknown }).lineup);
    if (e.type === "player_arrived" && e.player_id) present.add(e.player_id);
  }

  // How long each period ran, from its hooter (the latest, if re-ended).
  const periodPlayedMs: Record<number, number> = {};
  for (const e of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (e.type !== "quarter_end") continue;
    const m = e.metadata as { quarter?: number; elapsed_ms?: number };
    if (typeof m.quarter === "number" && typeof m.elapsed_ms === "number") periodPlayedMs[m.quarter] = m.elapsed_ms;
  }

  return gameReport({
    byPeriod,
    present: Array.from(present),
    periodPlayedMs,
    lines,
    lineLabel: (k) => LABELS[k] ?? k,
    lineWord: sport === "netball" ? "third" : "line",
    periodLabel: (n) => (ageCfg.periodLabel === "half" ? `half ${n}` : `Q${n}`),
    periodCount: ageCfg.periodCount,
    periodMs: periodSeconds * 1000,
    minGameTimePct: snapshot?.policy.minGameTimePct ?? resolved.policy.minGameTimePct,
    rules,
    name: (pid) => playerNames[pid] ?? "A fill-in",
    homeLine,
    season,
  });
}
