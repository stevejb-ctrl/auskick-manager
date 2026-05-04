import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { AvailabilityList } from "@/components/games/AvailabilityList";
import { ShareRunnerLink } from "@/components/games/ShareRunnerLink";
import { ResetGameButton } from "@/components/games/ResetGameButton";
import { DeleteGameButton } from "@/components/games/DeleteGameButton";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { Spinner } from "@/components/ui/Spinner";
import {
  Eyebrow,
  Guernsey,
  SFButton,
  SFCard,
  SFIcon,
  StatusPill,
} from "@/components/sf";
import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";
import type { Game, Sport } from "@/lib/types";

interface GameDetailPageProps {
  params: { teamId: string; gameId: string };
}

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
      .select("age_group, sport")
      .eq("id", params.teamId)
      .single(),
    supabase
      .from("game_events")
      .select("type, player_id")
      .eq("game_id", params.gameId)
      .in("type", ["goal", "behind"]),
    supabase
      .from("players")
      .select("id, full_name, jersey_number")
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
  const canMarkAvailability = !!role;
  const ageGroup = ageGroupOf(
    (team as { age_group?: string } | null)?.age_group,
  );
  const ageCfg = AGE_GROUPS[ageGroup];
  // Netball has no jersey numbers — hide the # input on AddFillInForm.
  const sport: Sport = ((team as { sport?: Sport } | null)?.sport) ?? "afl";

  const tallies = new Map<string, { goals: number; behinds: number }>();
  for (const ev of (scoringEvents ?? []) as { type: string; player_id: string | null }[]) {
    if (!ev.player_id) continue;
    const cur = tallies.get(ev.player_id) ?? { goals: 0, behinds: 0 };
    if (ev.type === "goal") cur.goals++;
    else if (ev.type === "behind") cur.behinds++;
    tallies.set(ev.player_id, cur);
  }
  const playerById = new Map(
    ((players ?? []) as { id: string; full_name: string; jersey_number: number }[]).map(
      (p) => [p.id, p],
    ),
  );
  const scorerRows = Array.from(tallies.entries())
    .map(([pid, t]) => ({ player: playerById.get(pid), ...t }))
    .filter((r) => r.player)
    .sort((a, b) => b.goals - a.goals || b.behinds - a.behinds);

  const isLive = g.status === "in_progress";
  const isFinal = g.status === "completed";
  const isUp = g.status === "upcoming";

  return (
    <div className="space-y-6">
      <Link
        href={`/teams/${params.teamId}/games`}
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
      >
        <SFIcon.chevronLeft />
        Games
      </Link>

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
          {canRun && (
            <div className="flex flex-col gap-2 border-t border-hairline bg-surface px-5 py-4 sm:flex-row sm:px-7">
              <SFButton
                href={`/teams/${params.teamId}/games/${params.gameId}/live`}
                variant="alarm"
                iconAfter={<SFIcon.chevronRight color="white" />}
                className="w-full sm:w-auto"
              >
                Open live game
              </SFButton>
              <ShareRunnerLink token={g.share_token} />
              {role === "admin" && (
                <ResetGameButton
                  auth={{ kind: "team", teamId: params.teamId }}
                  gameId={params.gameId}
                />
              )}
              {role === "admin" && (
                <DeleteGameButton
                  teamId={params.teamId}
                  gameId={params.gameId}
                />
              )}
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
                {g.location && ` · Home`}
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
                {ageCfg.label} ·{" "}
                {isUp ? ageCfg.defaultOnFieldSize : g.on_field_size} on field
                {!isUp && g.on_field_size < ageCfg.defaultOnFieldSize && (
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
            <div className="flex flex-col gap-2 border-t border-hairline bg-surface-alt px-5 py-4 sm:flex-row sm:items-center sm:px-7">
              <SFButton
                href={`/teams/${params.teamId}/games/${params.gameId}/live`}
                variant="primary"
                iconAfter={<SFIcon.chevronRight color="currentColor" />}
                className="w-full sm:w-auto"
              >
                {isUp ? "Start game" : "Open live game"}
              </SFButton>
              <ShareRunnerLink token={g.share_token} />
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
              {role === "admin" && !isUp && (
                <ResetGameButton
                  auth={{ kind: "team", teamId: params.teamId }}
                  gameId={params.gameId}
                />
              )}
              {role === "admin" && (
                <DeleteGameButton
                  teamId={params.teamId}
                  gameId={params.gameId}
                />
              )}
            </div>
          )}
        </SFCard>
      )}

      {/* ── Scorers (sport-aware: AFL = goal kickers w/ behinds + Guernsey;
            netball = goal shooters, goals only, no jersey numbers) ─────── */}
      {scorerRows.length > 0 && (
        <SFCard>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Eyebrow>
                {sport === "netball" ? "Goal shooters" : "Goal kickers"}
              </Eyebrow>
              <h3 className="mt-1 text-lg font-bold tracking-tightest text-ink">
                {sport === "netball" ? "Who put it in" : "Who put it through"}
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
                  {sport !== "netball" && (
                    <Guernsey num={r.player!.jersey_number} size={32} />
                  )}
                  <span className="font-semibold text-ink">
                    {r.player!.full_name}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-ink-dim">
                  {sport === "netball" ? (
                    <>
                      <span className="font-bold text-ink">{r.goals}</span>
                      <span className="ml-1 text-[10px] uppercase tracking-[0.1em] text-ink-mute">
                        {r.goals === 1 ? "goal" : "goals"}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-ink">{r.goals}</span> g ·{" "}
                      <span className="font-bold text-ink">{r.behinds}</span> b
                      <span className="ml-2 font-bold text-ink">
                        {r.goals * 6 + r.behinds}
                      </span>
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

      {/* ── Availability list (untouched, just below the hero) ───────── */}
      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        }
      >
        <AvailabilityList
          auth={{ kind: "team", teamId: params.teamId }}
          teamId={params.teamId}
          gameId={params.gameId}
          canMarkAvailability={canMarkAvailability}
          canManageMatch={canManageMatch}
          showJerseyNumber={sport !== "netball"}
        />
      </Suspense>
    </div>
  );
}
