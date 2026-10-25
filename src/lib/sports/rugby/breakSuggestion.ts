// ─── Rugby (league and union): the break's "Suggested" ───────
// The next period of the planner's own projection (the "Suggested" the
// plan-ahead modal offers), anchored to the period just played, the
// kids who can't play at the end of the bench. Lines split by the kids'
// roles: How we play goes to the planner (UX audit, 23 Oct 2026: it
// didn't, so a union side with named positions had eight of fifteen
// kids moved across lines at half time).

import { availablePlayersForPlan } from "@/lib/game-plan/availableForPlan";
import { projectUpcomingRotation } from "@/lib/game-plan/live";
import { benchSidelinedInLeagueLineup } from "@/lib/live/lineupOps";
import type { LeaguePlaybookInput } from "@/lib/sports/rugby_league/engine";
import type { RugbySport } from "@/lib/sports/registry";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { ChipKey, ChipMode } from "@/lib/chips";
import type { PlayerChip } from "@/lib/types";

type Lineup = { forwards: string[]; backs: string[]; bench: string[] };

export interface LeagueBreakSuggestionInput {
  sport: RugbySport;
  ageGroup: AgeGroupConfig;
  squad: { id: string; chip?: PlayerChip | null }[];
  /** The lineup at the end of the period just played. */
  previousLineup: Lineup;
  injured: ReadonlySet<string>;
  loaned: ReadonlySet<string>;
  onFieldSize: number;
  /** The period just played (1-based). */
  currentQuarter: number;
  chipModes?: Partial<Record<ChipKey, ChipMode>>;
  leaguePlaybook?: LeaguePlaybookInput;
  /** The planner's seed (the break uses 7). */
  seed?: number;
}

export function leagueBreakSuggestion(input: LeagueBreakSuggestionInput): Lineup {
  const { previousLineup, injured, loaned } = input;
  const sidelined = new Set([...Array.from(injured), ...Array.from(loaned)]);
  const inGame = [...previousLineup.forwards, ...previousLineup.backs, ...previousLineup.bench];
  const healthy = inGame.filter((id) => !sidelined.has(id));
  const sidelinedInGame = inGame.filter((id) => sidelined.has(id));
  const repeat = benchSidelinedInLeagueLineup(previousLineup, sidelined);
  const players = availablePlayersForPlan(input.squad, new Set(inGame), injured, loaned);
  if (players.length === 0) return repeat;
  const nextPeriod = input.currentQuarter + 1;
  const plan = projectUpcomingRotation({
    sport: input.sport,
    ageGroup: input.ageGroup,
    players,
    onFieldSize: input.onFieldSize,
    seed: input.seed ?? 7,
    chipModeByKey: input.chipModes,
    leaguePlaybook: input.leaguePlaybook,
    fromPeriodIndex: Math.max(0, input.currentQuarter - 1),
    currentGroups: { forwards: previousLineup.forwards, backs: previousLineup.backs },
    currentBench: previousLineup.bench,
  });
  const next = plan.periods.find((p) => p.period === nextPeriod) ?? plan.periods[1];
  if (!next) return repeat;
  const group = (id: string) => next.groups.find((g) => g.groupId === id)?.playerIds ?? [];
  const forwards = group("forwards");
  const backs = group("backs");
  const placed = new Set([...forwards, ...backs]);
  return { forwards, backs, bench: [...healthy.filter((id) => !placed.has(id)), ...sidelinedInGame] };
}
