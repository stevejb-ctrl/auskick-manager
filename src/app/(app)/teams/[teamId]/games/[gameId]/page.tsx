import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { GameMoreMenu } from "@/components/games/GameMoreMenu";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import {
  Eyebrow,
  Guernsey,
  SFButton,
  SFCard,
  SFIcon,
  StatusPill,
} from "@/components/sf";
import { getAgeGroupConfig, getEffectiveQuarterSeconds, getSportConfig, isBasketball, isSoccer, isTouch, periodLabels, teamSport } from "@/lib/sports";
import { teamMixedRule } from "@/lib/sports/touch/mixed";
import { ownGoalsFromEvents, scoresKept, scorersFromEvents, unnamedScoreFromEvents } from "@/lib/results";
import { getSeasonEvents } from "@/lib/season";
import { gamePlanPlaybooks } from "@/lib/playbook/planInputs";
import { gamePlanAnchor } from "@/lib/game-plan/anchor";
import { FinishedGameSummary } from "@/components/games/FinishedGameSummary";
import { GamePlanButton } from "@/components/game-plan/GamePlanButton";
import { AskAvailabilityButton } from "@/components/games/AskAvailabilityButton";
import { HowWePlayedCard } from "@/components/playbook/HowWePlayedCard";
import { buildGameReport } from "@/lib/playbook/gameReportServer";
import type { Game, GameEvent, MixedGroup, Player, Sport } from "@/lib/types";
import { BackLink } from "@/components/ui/BackLink";
import { teamSportById } from "@/lib/sports/teamSportById";
import { teamAgeGroup } from "@/lib/sports/teamAgeGroup";
import { teamOnFieldSize } from "@/lib/games/newGameDefaults";
import { distinctFullNames } from "@/lib/names";
import { isNotPlayed, playedInSiren } from "@/lib/games/notPlayed";
import { NotPlayedActions } from "@/components/games/NotPlayedGames";
import { finishedScoreLog, scoreKinds } from "@/lib/games/finishedScores";
import type { FixScoresProps } from "@/components/games/FixScoresDialog";
import { replayBasketballGame } from "@/lib/sports/basketball/replay";

interface GameDetailPageProps {
  params: { teamId: string; gameId: string };
}

/** The scorer card's words, per sport. */
const SCORER_WORDS: Record<Sport, { eyebrow: string; heading: string }> = {
  afl: { eyebrow: "Goal kickers", heading: "Who put it through" },
  netball: { eyebrow: "Goal shooters", heading: "Who put it in" },
  rugby_league: { eyebrow: "Scorers", heading: "Who put points on the board" },
  rugby_union: { eyebrow: "Scorers", heading: "Who put points on the board" },
  soccer: { eyebrow: "Goal scorers", heading: "Who found the net" },
  basketball: { eyebrow: "Scorers", heading: "Who put points on the board" },
  futsal: { eyebrow: "Goal scorers", heading: "Who found the net" },
  hockey: { eyebrow: "Goal scorers", heading: "Who found the net" },
  touch: { eyebrow: "Try scorers", heading: "Who got it down" },
  oztag: { eyebrow: "Try scorers", heading: "Who got it down" },
};

export default async function GameDetailPage({ params }: GameDetailPageProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await getUser();

  const [
    { data: game },
    { data: membership },
    { data: team },
    { data: scoringEvents },
    { data: players },
  ] = await Promise.all([
    supabase
      .from("games")
      .select("*")
      .eq("id", params.gameId)
      .eq("team_id", params.teamId)
      .single(),
    user
      ? supabase
          .from("team_memberships")
          .select("role")
          .eq("team_id", params.teamId)
          .eq("user_id", user.id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("teams")
      .select("age_group, sport, name, track_scoring, quarter_length_seconds, on_field_size, period_count, mixed_max_boys, mixed_min_girls, mixed_min_boys")
      .eq("id", params.teamId)
      .single(),
    // Every event: each sport's replay tallies the scorers, honouring
    // score_undo (a raw goal / behind count kept undone scores).
    supabase
      .from("game_events")
      .select("*")
      .eq("game_id", params.gameId)
      .order("created_at", { ascending: true }),
    supabase
      .from("players")
      .select("id, full_name, jersey_number, chip, is_active, mixed_group")
      .eq("team_id", params.teamId)
      // The lineup screen's order, which its suggestion follows: the
      // Game plan below opens on the same lineup.
      .order("jersey_number"),
  ]);

  if (!game) notFound();

  // Pre-game saved lineup (Phase C). Drives the "Plan saved" chip
  // for upcoming games so the coach knows their armchair plan
  // persisted, and the Game plan opens on it. Cleared at startGame.
  const { data: draftRow } =
    (game as Game).status === "upcoming"
      ? await supabase
          .from("game_lineup_drafts")
          .select("updated_at, lineup, on_field_size, sub_interval_seconds")
          .eq("game_id", params.gameId)
          .maybeSingle()
      : { data: null };
  const planSavedAt = (draftRow as { updated_at?: string } | null)?.updated_at ?? null;

  const g = game as Game;
  const role = membership?.role;
  const canManageMatch = role === "admin" || role === "game_manager";
  const canRun = canManageMatch;
  // Netball has no jersey numbers — hide the # input on AddFillInForm.
  const sport: Sport = team ? teamSport((team as { sport?: Sport }).sport) : ((await teamSportById(params.teamId)) ?? notFound());
  const teamName = (team as { name?: string } | null)?.name ?? "Us";
  // Sport-config age-group shape (label, on-field size, positions,
  // zones, period count). Always the team's own sport — never the
  // AFL-only AGE_GROUPS map, which mislabelled netball and league
  // games (UX plan H3).
  const planAgeCfg = getAgeGroupConfig(
    sport,
    (team as { age_group?: string } | null)?.age_group,
  );
  // The team's own halves, quarters or one period, for the game menu.
  const periodLabel = periodLabels(
    sport,
    teamAgeGroup(
      sport,
      (team as { age_group?: string } | null)?.age_group,
      (team as { period_count?: number | null } | null)?.period_count,
    ),
  ).label;

  const playerById = new Map(
    ((players ?? []) as { id: string; full_name: string; jersey_number: number }[]).map(
      (p) => [p.id, p],
    ),
  );
  const scorerRows = scorersFromEvents(sport, (scoringEvents ?? []) as GameEvent[])
    .map((t) => ({ player: playerById.get(t.playerId), ...t }))
    .filter((r) => r.player);
  // Scored with nobody named ("Not sure who"): its own row, so the card
  // adds up to the score (UX round 2, 24 Oct 2026).
  const unnamedScore = unnamedScoreFromEvents(sport, (scoringEvents ?? []) as GameEvent[]);
  const ownGoals = ownGoalsFromEvents(sport, (scoringEvents ?? []) as GameEvent[]);
  const scorerWords = SCORER_WORDS[sport];
  // Basketball: each kid's fouls, for the coach. The summary said only
  // "fouled out", so nobody could see who finished on 4 (Stagehand
  // round 7, 28 Oct 2026). Not in the share text: it goes to every parent.
  const foulRows = isBasketball(sport)
    ? (() => {
        const replay = replayBasketballGame((scoringEvents ?? []) as GameEvent[]);
        const out = new Set(replay.fouledOutIds);
        return Object.entries(replay.fouls)
          .filter(([id, n]) => n > 0 && playerById.has(id))
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => ({ player: playerById.get(id)!, fouls: n, fouledOut: out.has(id) }));
      })()
    : [];
  // Two kids with the same name read "Ava Smith #3" / "#12" (lib/names).
  const scorerNames = distinctFullNames(Array.from(playerById.values()));

  const isLive = g.status === "in_progress";
  const isFinal = g.status === "completed";
  // "Game day" from six hours before kickoff: the primary reads "Start
  // game day" instead of "Plan lineup" (same screen, different intent).
  const isGameDay =
    g.status === "upcoming" &&
    Date.now() >= new Date(g.scheduled_at).getTime() - 6 * 60 * 60 * 1000;
  const isUp = g.status === "upcoming";

  // Game plan from here is a preview to share: the active kids marked
  // available (everyone active until someone's marked), the game's own
  // field size, season history and How we play, as the lineup uses.
  // Football (soccer)'s game plan comes with its How we play (phase 3
  // of .planning/SOCCER-PLAN.md); until then its game page has none.
  // Basketball skips the game-plan preview too (its plan), and so do
  // touch and Oztag: their engine plans at the lineup and each break
  // (asking gamePlanPlaybooks for them throws by name).
  //
  // It's the plan the lineup screen will use (UX round 2, 24 Oct 2026:
  // the night-before text shared a different Q1 from the lineup, even
  // after "Plan saved"): its first period is the saved plan's lineup,
  // else AFL's opening suggestion, and the rest follow from it as the
  // lineup's own Game plan does. The text says when, where and who's out.
  const planInput = isUp && !isSoccer(sport) && !isBasketball(sport) && !isTouch(sport)
    ? await (async () => {
        const [{ data: avail }, seasonAll] = await Promise.all([
          supabase.from("game_availability").select("player_id, status").eq("game_id", params.gameId),
          getSeasonEvents(params.teamId),
        ]);
        const active = (players ?? []).filter((p) => (p as { is_active?: boolean }).is_active !== false);
        const available = new Set((avail ?? []).filter((a) => a.status === "available").map((a) => a.player_id as string));
        const planPlayers = available.size > 0 ? active.filter((p) => available.has(p.id)) : active;
        const seasonEvents = seasonAll.filter((e) => e.game_id !== params.gameId);
        const periodSeconds = getEffectiveQuarterSeconds(
          { quarter_length_seconds: (team as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null },
          planAgeCfg,
          { quarter_length_seconds: g.quarter_length_seconds },
        );
        const playbooks = await gamePlanPlaybooks(
          supabase,
          params.teamId,
          sport,
          (team as { age_group?: string } | null)?.age_group ?? null,
          seasonEvents,
          periodSeconds,
        );
        const draft = draftRow as { lineup?: unknown; on_field_size?: number; sub_interval_seconds?: number } | null;
        return {
          players: planPlayers,
          seasonEvents,
          periodMinutes: periodSeconds / 60,
          playbooks,
          onFieldSize: draft?.on_field_size ?? g.on_field_size ?? planAgeCfg.defaultOnFieldSize,
          subIntervalSeconds: draft?.sub_interval_seconds ?? g.sub_interval_seconds,
          anchor: gamePlanAnchor({
            sport,
            draftLineup: draft?.lineup ?? null,
            here: new Set(planPlayers.map((p) => p.id)),
            players: planPlayers as Player[],
            thisGame: (scoringEvents ?? []) as GameEvent[],
            seasonEvents,
            onFieldSize: g.on_field_size,
            ageGroup: planAgeCfg,
            fullPeriodMs: periodSeconds * 1000,
            aflPlaybook: playbooks.aflPlaybook,
          }),
          out: available.size > 0
            ? active.filter((p) => !available.has(p.id)).map((p) => p.full_name.trim().split(/\s+/)[0])
            : [],
        };
      })()
    : null;

  // A finished game's summary and How we played read the whole event
  // log (already fetched above, in order), and the game's fill-ins: the
  // summary names them as the live screen's does.
  const summaryEvents: GameEvent[] | null = isFinal ? ((scoringEvents ?? []) as GameEvent[]) : null;
  // Whether THIS game kept score, not the team's switch today.
  const keptScore = scoresKept(
    sport,
    g,
    (team as { track_scoring?: boolean } | null)?.track_scoring ?? false,
    (scoringEvents ?? []) as GameEvent[],
  );
  const { data: fillIns } = isFinal
    ? await supabase.from("game_fill_ins").select("id, full_name, jersey_number, mixed_group").eq("game_id", params.gameId)
    : { data: null };
  type SummaryKid = { id: string; full_name: string; jersey_number: number | null; mixed_group?: MixedGroup | null };
  const summarySquad = [...((players ?? []) as SummaryKid[]), ...((fillIns ?? []) as SummaryKid[])];

  // Touch and Oztag: halves or one period, and a mixed team's rule, whose
  // report compares each kid's time within their group (squad kids' and
  // the game's fill-ins').
  const touchTeam = team as {
    period_count?: number | null;
    mixed_max_boys?: number | null;
    mixed_min_girls?: number | null;
    mixed_min_boys?: number | null;
  } | null;
  const mixedGroups: Record<string, MixedGroup | null> | undefined =
    isFinal && isTouch(sport) && teamMixedRule(touchTeam)
      ? Object.fromEntries(summarySquad.map((p) => [p.id, p.mixed_group ?? null]))
      : undefined;

  // How we played (UX plan 4.4): rules kept and season balance, every
  // sport. The coach's and managers' only: it names the kids who played
  // under a fair share, and a parent shouldn't read that about someone
  // else's child (round 2 usability, 24 Oct 2026).
  // A game marked played (not run in Siren) has no events: no summary,
  // score or report, rather than a 0–0 draw with nobody on.
  const ranInSiren = summaryEvents !== null && playedInSiren(summaryEvents);
  // A finished game's scores, fixable from More (round 3 edge testing:
  // "Open game screen: fix scores" opened a read-only summary).
  const teamAge = teamAgeGroup(
    sport,
    (team as { age_group?: string } | null)?.age_group,
    (team as { period_count?: number | null } | null)?.period_count,
  );
  const scoreNames = distinctFullNames(summarySquad);
  const fixScores: FixScoresProps | undefined =
    isFinal && summaryEvents && ranInSiren && canManageMatch && (team as { track_scoring?: boolean } | null)?.track_scoring
      ? {
          teamId: params.teamId,
          gameId: params.gameId,
          kinds: scoreKinds(sport, {
            goalsFromPlay: (teamAge as { goalsFromPlay?: boolean }).goalsFromPlay ?? true,
            girlsTry: sport === "oztag" && teamMixedRule(touchTeam) !== null,
          }),
          log: finishedScoreLog(sport, summaryEvents),
          players: summarySquad.map((p) => ({ id: p.id, name: scoreNames.get(p.id) ?? p.full_name })),
          periodCount: teamAge.periodCount,
          periodLetter: periodLabel.charAt(0).toUpperCase(),
          teamName,
          opponentName: g.opponent,
        }
      : undefined;

  const howWePlayed =
    isFinal && summaryEvents && ranInSiren && canManageMatch
      ? await buildGameReport(
          supabase,
          {
            id: params.teamId,
            sport,
            age_group: (team as { age_group?: string | null } | null)?.age_group ?? null,
            quarter_length_seconds:
              (team as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null,
            // Basketball's and hockey's halves or quarters, touch's and
            // Oztag's halves or one period.
            period_count: (team as { period_count?: number | null } | null)?.period_count ?? null,
            ...(isTouch(sport)
              ? {
                  mixed_max_boys: touchTeam?.mixed_max_boys ?? null,
                  mixed_min_girls: touchTeam?.mixed_min_girls ?? null,
                  mixed_min_boys: touchTeam?.mixed_min_boys ?? null,
                }
              : {}),
          },
          g,
          summaryEvents,
          Object.fromEntries(Array.from(playerById.values()).map((p) => [p.id, p.full_name])),
          mixedGroups,
        )
      : null;

  return (
    <div className="space-y-6">
      <BackLink href={`/teams/${params.teamId}/games`} label="Games" />

      {/* ── Hero card — status-aware ─────────────────────────────────── */}
      {isLive ? (
        <SFCard pad={0} className="overflow-hidden border-alarm/60">
          <div className="bg-ink px-5 py-5 text-warm sm:px-7 sm:py-6">
            <div className="flex items-center justify-between gap-3">
              <StatusPill status="live" />
              <span className="font-mono text-xs font-semibold tracking-[0.06em] text-warm/70">
                {g.round_number != null && `R${String(g.round_number).padStart(2, "0")} · `}
                In progress
              </span>
            </div>
            <div className="mt-4">
              <div className="text-xs font-medium text-warm/70">vs</div>
              <div className="mt-0.5 text-3xl font-bold leading-tight tracking-tightest sm:text-[40px]">
                {g.opponent}
              </div>
              {(g.location || g.scheduled_at) && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-warm/85">
                  <span>
                    <FormattedDateTime iso={g.scheduled_at} mode="long" />
                  </span>
                  {g.location && (
                    <span className="inline-flex items-center gap-1">
                      <SFIcon.pin color="rgba(247,245,241,0.7)" />
                      {g.location}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {!canRun && (
            <div className="border-t border-hairline bg-surface px-5 py-4 sm:px-7">
              <SFButton
                href={`/teams/${params.teamId}/games/${params.gameId}/live`}
                variant="alarm"
                iconAfter={<SFIcon.chevronRight color="white" />}
                className="w-full sm:w-auto"
              >
                Watch live
              </SFButton>
            </div>
          )}
          {canRun && (
            <div className="flex flex-col gap-2 border-t border-hairline bg-surface px-5 py-4 sm:flex-row sm:px-7">
              <SFButton
                href={`/teams/${params.teamId}/games/${params.gameId}/live`}
                variant="alarm"
                iconAfter={<SFIcon.chevronRight color="white" />}
                className="w-full sm:w-auto"
              >
                Back to live game
              </SFButton>
              <GameMoreMenu
                teamId={params.teamId}
                gameId={params.gameId}
                shareToken={g.share_token}
                canReplaceLink={role === "admin"}
                canRestart={role === "admin"}
                canDelete={role === "admin"}
                periodLabel={periodLabel}
                live
              />
            </div>
          )}
        </SFCard>
      ) : (
        <SFCard pad={0} className="overflow-hidden">
          <div className="px-5 py-5 sm:px-7 sm:py-7">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>
                {g.round_number != null
                  ? `Round ${String(g.round_number).padStart(2, "0")}`
                  : "Game"}
              </Eyebrow>
              <StatusPill status={isFinal ? "final" : "upcoming"} />
            </div>
            <div className="mt-3">
              <div className="text-sm font-medium text-ink-dim">vs</div>
              <div className="mt-0.5 text-3xl font-bold leading-[1.05] tracking-tightest text-ink sm:text-[40px]">
                {g.opponent}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-dim">
                <span>
                  <FormattedDateTime iso={g.scheduled_at} mode="long" />
                </span>
                {g.location && (
                  <span className="inline-flex items-center gap-1">
                    <SFIcon.pin />
                    {g.location}
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs text-ink-mute">
                {/* The game's own size: it starts at the team's (its
                    competition's), else the age group's. */}
                {planAgeCfg.label} · {g.on_field_size} on field
                {!isUp &&
                  g.on_field_size <
                    teamOnFieldSize(planAgeCfg, (team as { on_field_size?: number | null } | null)?.on_field_size ?? null) && (
                  <span className="ml-1 font-medium text-warn">(short-handed)</span>
                )}
              </p>
              {g.notes && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-ink-dim">
                  {g.notes}
                </p>
              )}
              {/* Well past its start and never run (lib/games/notPlayed). */}
              {isUp && isNotPlayed(g) && (
                <div className="mt-4 rounded-md bg-surface-alt p-3" data-testid="not-played">
                  <NotPlayedActions teamId={params.teamId} gameId={g.id} canEdit={role === "admin"} afterDelete="games" />
                </div>
              )}
            </div>
          </div>
          {canRun && (
            <div className="border-t border-hairline bg-surface-alt px-5 py-4 sm:px-7">
              {/* Game hub (UX plan §6): one primary action per state —
                    upcoming → Plan lineup (Start game day on the day)
                    live     → Back to live game
                    final    → Summary
                  Secondary actions are ghost buttons; everything else
                  (game-day link, edit, restart, delete) is in More. */}
              <div className="flex flex-col gap-2">
                {isUp ? (
                  <>
                    {/* One door into the lineup screen. It used to be
                        two buttons ("Start game", "Set lineup") that
                        both opened availability (UX plan H2). Availability
                        stays one tap away for the night before. */}
                    <SFButton
                      href={`/teams/${params.teamId}/games/${params.gameId}/live`}
                      variant="primary"
                      iconAfter={<SFIcon.chevronRight color="currentColor" />}
                      className="w-full sm:w-auto"
                    >
                      {isGameDay ? "Start game day" : "Plan lineup"}
                    </SFButton>
                  </>
                ) : isFinal ? (
                  // A final game's one job is its summary (UX plan H3),
                  // on this page in every sport.
                  <SFButton
                    href="#summary"
                    variant="primary"
                    iconAfter={<SFIcon.chevronRight color="currentColor" />}
                    className="w-full sm:w-auto"
                  >
                    Summary
                  </SFButton>
                ) : (
                  <SFButton
                    href={`/teams/${params.teamId}/games/${params.gameId}/live`}
                    variant="primary"
                    iconAfter={<SFIcon.chevronRight color="currentColor" />}
                    className="w-full sm:w-auto"
                  >
                    Back to live game
                  </SFButton>
                )}
              </div>

              {/* Secondary actions share one row under the primary —
                  equal thirds on a phone, natural widths from sm. */}
              <div className="mt-2 space-y-2">
                {/* Pre-game lineup-plan indicator. Surfaces only when
                    the coach has saved a draft and the game's still
                    upcoming. Cleared automatically at kickoff. */}
                {isUp && planSavedAt && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 px-3 py-1 text-xs font-semibold text-ok"
                    title={`Last saved ${new Date(planSavedAt).toLocaleString()}`}
                  >
                    <span aria-hidden>✓</span>
                    Plan saved
                  </span>
                )}
                <div className="grid grid-flow-col auto-cols-fr gap-2 sm:flex sm:flex-wrap">
                {isUp && (
                  <SFButton
                    href={`/teams/${params.teamId}/games/${params.gameId}/availability`}
                    variant="ghost"
                    className="w-full whitespace-nowrap !px-2 sm:w-auto sm:!px-[18px]"
                  >
                    Availability
                  </SFButton>
                )}
                {/* Pre-game rotation planner — auto-suggests a fair
                    full-game rotation the coach can tweak and copy into
                    the team chat. Pure client compute; no DB write. */}
                {isUp && planInput && (
                  <GamePlanButton
                    sport={sport}
                    ageGroup={planAgeCfg}
                    players={planInput.players}
                    onFieldSize={planInput.onFieldSize}
                    periodMinutes={planInput.periodMinutes}
                    subIntervalSeconds={planInput.subIntervalSeconds}
                    teamName={teamName}
                    opponentName={g.opponent}
                    seasonEvents={planInput.seasonEvents}
                    anchor={planInput.anchor ?? undefined}
                    pinnedPlanGameId={params.gameId}
                    details={{ scheduledAt: g.scheduled_at, venue: g.location, out: planInput.out }}
                    {...planInput.playbooks}
                    note="A preview to share. Set the lineup on game day."
                    variant="ghost"
                    size="md"
                    className="w-full whitespace-nowrap !px-2 sm:w-auto sm:!px-[18px]"
                  />
                )}
                <GameMoreMenu
                  teamId={params.teamId}
                  gameId={params.gameId}
                  shareToken={g.share_token}
                  canReplaceLink={role === "admin"}
                  edit={
                    // A finished game's opponent or date can be fixed too
                    // (round 3: a typo stayed in the history for good).
                    (isUp || isFinal) && role === "admin"
                      ? {
                          game: {
                            id: g.id,
                            opponent: g.opponent,
                            scheduled_at: g.scheduled_at,
                            location: g.location,
                            round_number: g.round_number,
                            notes: g.notes,
                          },
                          teamName,
                        }
                      : undefined
                  }
                  fixScores={fixScores}
                  canRestart={role === "admin" && !isUp}
                  canDelete={role === "admin"}
                  periodLabel={periodLabel}
                />
                </div>
                {/* The game's availability link for the group chat
                    (migration 0072): parents mark In or Out without an
                    account. */}
                {isUp && g.availability_token && (
                  <AskAvailabilityButton
                    teamName={teamName}
                    opponent={g.opponent}
                    scheduledAt={g.scheduled_at}
                    location={g.location}
                    token={g.availability_token}
                    className="w-full sm:w-auto"
                  />
                )}
              </div>
            </div>
          )}
          {/* A parent marks their child In or Out here too: the
              Availability button used to be coaches' and managers' only,
              so a parent who joined by code had no way in. */}
          {!canRun && role === "parent" && isUp && (
            <div className="border-t border-hairline bg-surface-alt px-5 py-4 sm:px-7">
              <SFButton
                href={`/teams/${params.teamId}/games/${params.gameId}/availability`}
                variant="primary"
                iconAfter={<SFIcon.chevronRight color="currentColor" />}
                className="w-full sm:w-auto"
              >
                Availability
              </SFButton>
            </div>
          )}
        </SFCard>
      )}

      {/* ── Scorers, in each sport's words (AFL goals + behinds, netball
            goals, league tries + kicks); numbers where the sport has them ── */}
      {(scorerRows.length > 0 || unnamedScore || ownGoals > 0) && (
        <SFCard>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Eyebrow>{scorerWords.eyebrow}</Eyebrow>
              <h3 className="mt-1 text-lg font-bold tracking-tightest text-ink">
                {scorerWords.heading}
              </h3>
            </div>
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-mute">
              {scorerRows.length} scorer{scorerRows.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="mt-4 divide-y divide-hairline">
            {scorerRows.map((r, i) => (
              <li
                key={r.player!.id}
                className="flex items-center justify-between py-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={`font-mono text-[11px] font-bold tracking-[0.06em] ${
                      i === 0 ? "text-warn" : "text-ink-mute"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {getSportConfig(sport).jerseyNumbers && (
                    <Guernsey num={r.player!.jersey_number} size={32} />
                  )}
                  <span className="min-w-0 break-words font-semibold text-ink">
                    {scorerNames.get(r.player!.id) ?? r.player!.full_name}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-ink-dim">
                  <span className="font-bold text-ink">{r.detail}</span>
                  {r.showPoints && (
                    <>
                      <span className="ml-2 font-bold text-ink">{r.points}</span>
                      <span className="ml-1 text-[10px] uppercase tracking-[0.1em] text-ink-mute">
                        pts
                      </span>
                    </>
                  )}
                </span>
              </li>
            ))}
            {unnamedScore && (
              <li data-testid="no-scorer-row" className="flex items-center justify-between py-3 text-sm">
                <span className="font-medium text-ink-dim">No scorer</span>
                <span className="font-mono font-bold tabular-nums text-ink">{unnamedScore.detail}</span>
              </li>
            )}
            {ownGoals > 0 && (
              <li data-testid="own-goal-row" className="flex items-center justify-between py-3 text-sm">
                <span className="font-medium text-ink-dim">Own goals (theirs)</span>
                <span className="font-mono font-bold tabular-nums text-ink">
                  {ownGoals} {ownGoals === 1 ? "goal" : "goals"}
                </span>
              </li>
            )}
          </ul>
        </SFCard>
      )}

      {foulRows.length > 0 && (
        <SFCard id="fouls">
          <Eyebrow>Fouls</Eyebrow>
          <h3 className="mt-1 text-lg font-bold tracking-tightest text-ink">Who picked up fouls</h3>
          <ul className="mt-4 divide-y divide-hairline">
            {foulRows.map((r) => (
              <li key={r.player.id} className="flex items-center justify-between py-3 text-sm">
                <span className="min-w-0 break-words font-semibold text-ink">
                  {scorerNames.get(r.player.id) ?? r.player.full_name}
                </span>
                <span className="font-mono tabular-nums text-ink-dim">
                  <span className="font-bold text-ink">{r.fouls}</span> {r.fouls === 1 ? "foul" : "fouls"}
                  {r.fouledOut && <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.1em] text-danger">Fouled out</span>}
                </span>
              </li>
            ))}
          </ul>
        </SFCard>
      )}

      {/* ── Full-time summary, every sport ─────────────────────────────
          The card each sport's live screen shows at full time (share
          text + "Copy for group chat"), so a coach or parent revisiting
          a finished game gets the score and game time here. The
          dashboard's "Last result" links straight to it. */}
      {isFinal && !ranInSiren && (
        <SFCard id="summary">
          <p className="text-sm text-ink-dim">
            Marked as played. It wasn&apos;t run in Siren, so there&apos;s no score or game time for it.
          </p>
        </SFCard>
      )}

      {isFinal && summaryEvents && ranInSiren && (
        <SFCard id="summary">
          {/* A game played with scoring off says so, whatever the switch
              says now (UX round 3, 24 Oct 2026: it read "0 drew with 0"). */}
          {!keptScore && (
            <p data-testid="scores-not-kept" className="mb-3 text-sm text-ink-dim">
              Scores not kept
            </p>
          )}
          <FinishedGameSummary
            sport={sport}
            events={summaryEvents}
            squad={summarySquad as Player[]}
            teamName={teamName}
            opponentName={g.opponent}
            trackScoring={keptScore}
            periodSeconds={getEffectiveQuarterSeconds(
              { quarter_length_seconds: (team as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null },
              planAgeCfg,
              { quarter_length_seconds: g.quarter_length_seconds },
            )}
          />
        </SFCard>
      )}

      {howWePlayed && (
        <SFCard>
          <HowWePlayedCard report={howWePlayed} />
        </SFCard>
      )}

      {/* Availability list moved to its own page — see
          ./availability/page.tsx. The "Start game" / "Set lineup"
          buttons above route there first; the game detail page
          itself is now strictly game info + the action row. */}
    </div>
  );
}
