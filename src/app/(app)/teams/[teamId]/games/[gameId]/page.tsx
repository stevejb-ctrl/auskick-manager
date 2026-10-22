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
import { getAgeGroupConfig, getEffectiveQuarterSeconds, getSportConfig, isBasketball, isSoccer, isTouch, teamSport } from "@/lib/sports";
import { teamMixedRule } from "@/lib/sports/touch/mixed";
import { scorersFromEvents } from "@/lib/results";
import { getSeasonEvents } from "@/lib/season";
import { gamePlanPlaybooks } from "@/lib/playbook/planInputs";
import { replayGame } from "@/lib/fairness";
import {
  playerThirdMs,
  replayNetballGame,
} from "@/lib/sports/netball/fairness";
import { primaryThirdFor } from "@/lib/sports/netball";
import { GameSummaryView } from "@/components/live/GameSummaryCard";
import { NetballGameSummaryCard } from "@/components/netball/NetballGameSummaryCard";
import { GamePlanButton } from "@/components/game-plan/GamePlanButton";
import { HowWePlayedCard } from "@/components/playbook/HowWePlayedCard";
import { buildGameReport } from "@/lib/playbook/gameReportServer";
import type { Game, GameEvent, MixedGroup, Sport } from "@/lib/types";
import { BackLink } from "@/components/ui/BackLink";
import { presentPlayerIds } from "@/lib/live/presentPlayers";
import { teamSportById } from "@/lib/sports/teamSportById";
import { teamOnFieldSize } from "@/lib/games/newGameDefaults";

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
      .eq("team_id", params.teamId),
  ]);

  if (!game) notFound();

  // Pre-game saved lineup (Phase C). Drives the "Plan saved" chip
  // for upcoming games so the coach knows their armchair plan
  // persisted. Cleared at startGame.
  const { data: draftRow } =
    (game as Game).status === "upcoming"
      ? await supabase
          .from("game_lineup_drafts")
          .select("updated_at")
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

  const playerById = new Map(
    ((players ?? []) as { id: string; full_name: string; jersey_number: number }[]).map(
      (p) => [p.id, p],
    ),
  );
  const scorerRows = scorersFromEvents(sport, (scoringEvents ?? []) as GameEvent[])
    .map((t) => ({ player: playerById.get(t.playerId), ...t }))
    .filter((r) => r.player);
  const scorerWords = SCORER_WORDS[sport];

  const isLive = g.status === "in_progress";
  const isFinal = g.status === "completed";
  // AFL and netball render the full-time summary card on this page.
  const hasInlineSummary = sport === "afl" || sport === "netball";
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
  const planInput = isUp && !isSoccer(sport) && !isBasketball(sport) && !isTouch(sport)
    ? await (async () => {
        const [{ data: avail }, seasonAll] = await Promise.all([
          supabase.from("game_availability").select("player_id, status").eq("game_id", params.gameId),
          getSeasonEvents(params.teamId),
        ]);
        const active = (players ?? []).filter((p) => (p as { is_active?: boolean }).is_active !== false);
        const available = new Set((avail ?? []).filter((a) => a.status === "available").map((a) => a.player_id as string));
        const seasonEvents = seasonAll.filter((e) => e.game_id !== params.gameId);
        const periodSeconds = getEffectiveQuarterSeconds(
          { quarter_length_seconds: (team as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null },
          planAgeCfg,
          { quarter_length_seconds: g.quarter_length_seconds },
        );
        return {
          players: available.size > 0 ? active.filter((p) => available.has(p.id)) : active,
          seasonEvents,
          periodMinutes: periodSeconds / 60,
          playbooks: await gamePlanPlaybooks(
            supabase,
            params.teamId,
            sport,
            (team as { age_group?: string } | null)?.age_group ?? null,
            seasonEvents,
            periodSeconds,
          ),
        };
      })()
    : null;

  // Full event log for the post-completion summary card. Fetched
  // for both AFL and netball when the game is final — both sports
  // now render their own summary view on the detail page so a
  // coach revisiting a finished game gets the rotations + Copy
  // for group chat without going back into /live.
  let summaryEvents: GameEvent[] | null = null;
  if (isFinal) {
    const { data } = await supabase
      .from("game_events")
      .select("*")
      .eq("game_id", params.gameId)
      .order("created_at", { ascending: true });
    summaryEvents = (data ?? []) as GameEvent[];
  }

  // Touch and Oztag: halves or one period, and a mixed team's rule, whose
  // report compares each kid's time within their group (squad kids' and
  // the game's fill-ins').
  const touchTeam = team as {
    period_count?: number | null;
    mixed_max_boys?: number | null;
    mixed_min_girls?: number | null;
    mixed_min_boys?: number | null;
  } | null;
  let mixedGroups: Record<string, MixedGroup | null> | undefined;
  if (isFinal && isTouch(sport) && teamMixedRule(touchTeam)) {
    const { data: fillIns } = await supabase.from("game_fill_ins").select("id, mixed_group").eq("game_id", params.gameId);
    mixedGroups = Object.fromEntries(
      [...((players ?? []) as { id: string; mixed_group?: MixedGroup | null }[]), ...((fillIns ?? []) as { id: string; mixed_group?: MixedGroup | null }[])].map(
        (p) => [p.id, p.mixed_group ?? null],
      ),
    );
  }

  // How we played (UX plan 4.4): rules kept and season balance, every sport.
  const howWePlayed =
    isFinal && summaryEvents
      ? await buildGameReport(
          supabase,
          {
            id: params.teamId,
            sport,
            age_group: (team as { age_group?: string | null } | null)?.age_group ?? null,
            quarter_length_seconds:
              (team as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null,
            ...(isTouch(sport)
              ? {
                  period_count: touchTeam?.period_count ?? null,
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
                canRestart={role === "admin"}
                canDelete={role === "admin"}
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
                  // A final game's one job is its summary (UX plan H3).
                  // AFL and netball render it on this page; league's
                  // full-time screen is the summary until it gets one here.
                  <SFButton
                    href={
                      hasInlineSummary
                        ? "#summary"
                        : `/teams/${params.teamId}/games/${params.gameId}/live`
                    }
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
                    onFieldSize={g.on_field_size ?? planAgeCfg.defaultOnFieldSize}
                    periodMinutes={planInput.periodMinutes}
                    subIntervalSeconds={g.sub_interval_seconds}
                    teamName={teamName}
                    opponentName={g.opponent}
                    seasonEvents={planInput.seasonEvents}
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
                  edit={
                    isUp && role === "admin"
                      ? {
                          game: {
                            id: g.id,
                            opponent: g.opponent,
                            scheduled_at: g.scheduled_at,
                            location: g.location,
                            round_number: g.round_number,
                            notes: g.notes,
                          },
                        }
                      : undefined
                  }
                  liveHref={
                    isFinal && hasInlineSummary
                      ? `/teams/${params.teamId}/games/${params.gameId}/live`
                      : undefined
                  }
                  canRestart={role === "admin" && !isUp}
                  canDelete={role === "admin"}
                />
                </div>
              </div>
            </div>
          )}
        </SFCard>
      )}

      {/* ── Scorers, in each sport's words (AFL goals + behinds, netball
            goals, league tries + kicks); numbers where the sport has them ── */}
      {scorerRows.length > 0 && (
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
                <span className="flex items-center gap-3">
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
                  <span className="font-semibold text-ink">
                    {r.player!.full_name}
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
          </ul>
        </SFCard>
      )}

      {/* ── Post-completion game summary ─────────────────────────────────
          Same shape (and copy-able share text) the live page shows the
          moment full time lands, so a coach revisiting a finished game
          from "Completed games" gets the rotations table + "Copy for
          group chat" without going back into /live. AFL only for now;
          netball needs its own summary view component before this
          surfaces there too. */}
      {isFinal && summaryEvents && sport === "afl" && (() => {
        const replay = replayGame(summaryEvents);
        const swapCount = summaryEvents.filter((e) => e.type === "swap").length;
        const teamRow = team as
          | { name?: string; track_scoring?: boolean }
          | null;
        return (
          <SFCard id="summary">
            <GameSummaryView
              teamName={teamRow?.name ?? "Us"}
              opponentName={g.opponent}
              trackScoring={teamRow?.track_scoring ?? true}
              teamScore={replay.teamScore}
              opponentScore={replay.opponentScore}
              playerScores={replay.playerScores}
              playersById={playerById}
              swapCount={swapCount}
              basePlayedZoneMs={replay.basePlayedZoneMs}
              presentIds={presentPlayerIds(summaryEvents)}
            />
          </SFCard>
        );
      })()}

      {/* Netball post-completion summary. Same purpose as the AFL
          branch above — render the GameSummaryCard the coach saw
          at FT, including the copy-for-group-chat button. The
          netball card already does the right thing (computes
          playedCount from buildPlayerTimes); we just need to feed
          it server-computed state via replayNetballGame +
          playerThirdMs. periodSeconds passed to playerThirdMs only
          matters for in-progress games (`inProgressMs` is null
          here), so we use the age-group default — for a finalised
          game the per-quarter durations come from each
          quarter_end event's elapsed_ms. */}
      {isFinal && summaryEvents && sport === "netball" && (() => {
        const replay = replayNetballGame(summaryEvents);
        const teamRow = team as
          | {
              name?: string;
              track_scoring?: boolean;
              quarter_length_seconds?: number | null;
            }
          | null;
        const periodSeconds =
          (teamRow?.quarter_length_seconds ?? null) ??
          (g as Game & { quarter_length_seconds?: number | null })
            .quarter_length_seconds ??
          // Fallback: 600s (10 min). Only matters as a fallback for
          // finalised replay; quarter_end events carry their own
          // elapsed_ms which the replay reads directly.
          600;
        const stats = playerThirdMs(
          summaryEvents,
          null,
          periodSeconds,
          primaryThirdFor as (
            posId: string,
          ) => "attack-third" | "centre-third" | "defence-third" | null,
        );
        return (
          <SFCard id="summary">
            <NetballGameSummaryCard
              teamName={teamRow?.name ?? "Us"}
              opponentName={g.opponent}
              teamScore={replay.teamScore}
              opponentScore={replay.opponentScore}
              playerGoals={replay.playerGoals}
              playerStats={stats}
              squad={
                (players ?? []) as { id: string; full_name: string }[]
              }
              trackScoring={teamRow?.track_scoring ?? false}
              presentIds={presentPlayerIds(summaryEvents)}
            />
          </SFCard>
        );
      })()}

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
