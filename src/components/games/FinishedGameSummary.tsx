// ─── FinishedGameSummary ─────────────────────────────────────
// The game page's full-time summary for a finished game, in every sport:
// the card each sport's live screen shows at full time (the share text
// and "Copy for group chat"), fed from a server replay of the event log.
// Only AFL and netball had one here, so eight sports' finished games
// showed no score or game time and the dashboard's "Last result" link to
// #summary went nowhere (UX audit, 23 Oct 2026).
//
// One entry per sport, so a new sport doesn't compile until it says what
// its summary is. No arrival halo: the game finished a while ago.

import type { ReactNode } from "react";
import { sidelinedAtEnd } from "@/lib/live/wentHome";
import { GameSummaryView } from "@/components/live/GameSummaryCard";
import { NetballGameSummaryCard } from "@/components/netball/NetballGameSummaryCard";
import { LeagueGameSummaryCard } from "@/components/league/LeagueGameSummaryCard";
import { SoccerGameSummaryCard } from "@/components/soccer/SoccerFullTime";
import { BasketballGameSummaryCard } from "@/components/basketball/BasketballFullTime";
import { TouchGameSummaryCard } from "@/components/touch/TouchFullTime";
import { replayGame } from "@/lib/fairness";
import { playerThirdMs, replayNetballGame, type ThirdLookup } from "@/lib/sports/netball/fairness";
import { primaryThirdFor } from "@/lib/sports/netball";
import { replayRugbyGame, rugbyPoints } from "@/lib/sports/rugby_league/fairness";
import { replaySoccerGame } from "@/lib/sports/soccer/replay";
import { soccerFamilyRules } from "@/lib/sports/soccer/family";
import { replayBasketballGame } from "@/lib/sports/basketball/replay";
import { replayTouchGame } from "@/lib/sports/touch/replay";
import type { RugbySport, SoccerSport } from "@/lib/sports/registry";
import { presentPlayerIds } from "@/lib/live/presentPlayers";
import type { GameEvent, Player, Sport } from "@/lib/types";

export interface FinishedGameSummaryProps {
  sport: Sport;
  events: GameEvent[];
  /** The squad and the game's fill-ins: names and numbers for the text. */
  squad: Player[];
  teamName: string;
  opponentName: string;
  trackScoring: boolean;
  /**
   * Netball: a period's length, for a quarter_end that has none (each
   * normally carries its own elapsed_ms).
   */
  periodSeconds: number;
}

type Input = Omit<FinishedGameSummaryProps, "sport">;

function afl({ events, squad, teamName, opponentName, trackScoring }: Input) {
  const replay = replayGame(events);
  return (
    <GameSummaryView
      teamName={teamName}
      opponentName={opponentName}
      trackScoring={trackScoring}
      teamScore={replay.teamScore}
      opponentScore={replay.opponentScore}
      playerScores={replay.playerScores}
      playersById={new Map(squad.map((p) => [p.id, p]))}
      swapCount={replay.subCount}
      basePlayedZoneMs={replay.basePlayedZoneMs}
      presentIds={presentPlayerIds(events)}
      sidelined={sidelinedAtEnd(events)}
    />
  );
}

function netball({ events, squad, teamName, opponentName, trackScoring, periodSeconds }: Input) {
  const replay = replayNetballGame(events);
  return (
    <NetballGameSummaryCard
      teamName={teamName}
      opponentName={opponentName}
      teamScore={replay.teamScore}
      opponentScore={replay.opponentScore}
      playerGoals={replay.playerGoals}
      playerStats={playerThirdMs(events, null, periodSeconds, primaryThirdFor as ThirdLookup)}
      squad={squad}
      trackScoring={trackScoring}
      presentIds={presentPlayerIds(events)}
      sidelined={sidelinedAtEnd(events)}
    />
  );
}

function rugby(sport: RugbySport, { events, squad, teamName, opponentName, trackScoring }: Input) {
  const state = replayRugbyGame(events, rugbyPoints(sport));
  return (
    <LeagueGameSummaryCard
      sport={sport}
      state={state}
      events={events}
      squad={squad}
      trackScoring={trackScoring}
      teamName={teamName}
      opponentName={opponentName}
      finalisedElapsedMs={state.quarterElapsedMs}
    />
  );
}

function soccer(sport: SoccerSport, { events, squad, teamName, opponentName, trackScoring }: Input) {
  return (
    <SoccerGameSummaryCard
      emoji={soccerFamilyRules(sport).emoji}
      state={replaySoccerGame(events)}
      squad={squad}
      presentIds={presentPlayerIds(events)}
      trackScoring={trackScoring}
      teamName={teamName}
      opponentName={opponentName}
    />
  );
}

function basketball({ events, squad, teamName, opponentName, trackScoring }: Input) {
  return (
    <BasketballGameSummaryCard
      state={replayBasketballGame(events)}
      squad={squad}
      presentIds={presentPlayerIds(events)}
      trackScoring={trackScoring}
      teamName={teamName}
      opponentName={opponentName}
    />
  );
}

function touch({ events, squad, teamName, opponentName, trackScoring }: Input) {
  return (
    <TouchGameSummaryCard
      state={replayTouchGame(events)}
      squad={squad}
      presentIds={presentPlayerIds(events)}
      trackScoring={trackScoring}
      teamName={teamName}
      opponentName={opponentName}
    />
  );
}

const SUMMARY: Record<Sport, (input: Input) => ReactNode> = {
  afl,
  netball,
  rugby_league: (input) => rugby("rugby_league", input),
  rugby_union: (input) => rugby("rugby_union", input),
  soccer: (input) => soccer("soccer", input),
  futsal: (input) => soccer("futsal", input),
  hockey: (input) => soccer("hockey", input),
  basketball,
  touch,
  oztag: touch,
};

export function FinishedGameSummary({ sport, ...input }: FinishedGameSummaryProps) {
  return <>{SUMMARY[sport](input)}</>;
}
