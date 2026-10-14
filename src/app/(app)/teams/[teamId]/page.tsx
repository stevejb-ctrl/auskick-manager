import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { FinishSetupBanner } from "@/components/setup/FinishSetupBanner";
import { KickoffPulseWrapper } from "@/components/games/KickoffPulseWrapper";
import {
  Eyebrow,
  RoundNumeral,
  SFCard,
  SFButton,
  SFIcon,
  StatusPill,
} from "@/components/sf";
import { getSeasonEvents } from "@/lib/season";
import { outcomeOf, scoreFromEvents, seasonRecord, type GameScore } from "@/lib/results";
import type { Game, GameEvent, Sport } from "@/lib/types";
import { teamSport } from "@/lib/sports";

interface TeamDashboardProps {
  params: { teamId: string };
}

/**
 * Today — the coach's landing page for a team (UX plan §6, 1.4).
 *
 *   1. Finish-setup banner (admins on empty squads only)
 *   2. Hero — live game, else the next game; on game day its primary
 *      goes straight to the game-day screen ("Start game day")
 *   3. To-dos — setup gaps the coach can close in one tap
 *   4. Last result + season snapshot (record across final games)
 *   5. More upcoming
 */
export default async function TeamDashboardPage({ params }: TeamDashboardProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await getUser();

  const [
    { data: upcomingRaw },
    { count: totalActive },
    { count: upcomingTotal },
    { data: membership },
    { data: teamRow },
    { data: finalGames },
    { count: memberCount },
  ] = await Promise.all([
    supabase
      .from("games")
      .select("*")
      .eq("team_id", params.teamId)
      .neq("status", "completed")
      .order("scheduled_at", { ascending: true })
      .limit(3),

    supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("team_id", params.teamId)
      .eq("is_active", true),

    supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("team_id", params.teamId)
      .neq("status", "completed"),

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
      .select("sport, track_scoring")
      .eq("id", params.teamId)
      .single(),

    supabase
      .from("games")
      .select("id, opponent, scheduled_at, round_number")
      .eq("team_id", params.teamId)
      .eq("status", "completed")
      .order("scheduled_at", { ascending: false }),

    supabase
      .from("team_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("team_id", params.teamId),
  ]);

  const sport = teamSport(teamRow?.sport);
  const trackScoring = teamRow?.track_scoring === true;
  const finals = (finalGames ?? []) as Pick<
    Game,
    "id" | "opponent" | "scheduled_at" | "round_number"
  >[];
  // Scores come from each final game's events (one cached read for the
  // whole season — the same cache the lineup suggester uses).
  const scoresById = new Map<string, GameScore>();
  if (trackScoring && finals.length > 0) {
    const byGame = new Map<string, GameEvent[]>();
    for (const ev of await getSeasonEvents(params.teamId)) {
      const list = byGame.get(ev.game_id) ?? [];
      list.push(ev);
      byGame.set(ev.game_id, list);
    }
    for (const g of finals) {
      scoresById.set(g.id, scoreFromEvents(sport, byGame.get(g.id) ?? []));
    }
  }
  const lastFinal = finals[0] ?? null;

  const upcomingIds = (upcomingRaw ?? []).map((g) => g.id);
  const { data: availabilityRaw } = upcomingIds.length
    ? await supabase
        .from("game_availability")
        .select("game_id, status")
        .in("game_id", upcomingIds)
        .eq("status", "available")
    : { data: [] };

  const upcoming = (upcomingRaw ?? []) as Game[];
  const playerCount = totalActive ?? 0;
  const upcomingCount = upcomingTotal ?? 0;
  const isAdmin = membership?.role === "admin";
  // Coaches and managers run games; parents follow them (UX plan §6).
  const canRun = isAdmin || membership?.role === "game_manager";
  const showSetupBanner = isAdmin && playerCount === 0;

  const availMap = new Map<string, number>();
  for (const row of availabilityRaw ?? []) {
    availMap.set(row.game_id, (availMap.get(row.game_id) ?? 0) + 1);
  }

  const liveGame = upcoming.find((g) => g.status === "in_progress");
  const nextGames = upcoming.filter((g) => g.status !== "in_progress");
  const [featuredGame, ...moreGames] = nextGames;

  // To-dos: setup gaps the coach can close in one tap (admins only).
  const todos: { id: string; label: string; detail: string; href: string }[] = [];
  if (isAdmin && playerCount > 0 && upcomingCount === 0) {
    todos.push({
      id: "add-game",
      label: "Add your next game",
      detail: "Import the fixture from PlayHQ or add one by hand.",
      href: `/teams/${params.teamId}/games`,
    });
  }
  if (isAdmin && (memberCount ?? 0) <= 1) {
    todos.push({
      id: "invite",
      label: "Invite a manager",
      detail: "Someone to run the game when you can't be on the sideline.",
      href: `/teams/${params.teamId}/settings`,
    });
  }

  return (
    <div className="space-y-4">
      {showSetupBanner && <FinishSetupBanner teamId={params.teamId} />}

      {liveGame ? (
        <LiveHero teamId={params.teamId} game={liveGame} canRun={canRun} />
      ) : featuredGame ? (
        <NextUpHero
          teamId={params.teamId}
          game={featuredGame}
          available={availMap.get(featuredGame.id) ?? 0}
          playerCount={playerCount}
          canRun={canRun}
        />
      ) : (
        <EmptyHero teamId={params.teamId} />
      )}

      {todos.length > 0 && <TodoList todos={todos} />}

      {lastFinal && (
        <LastResult
          teamId={params.teamId}
          game={lastFinal}
          score={scoresById.get(lastFinal.id) ?? null}
        />
      )}

      {finals.length > 0 && (
        <SeasonSnapshot
          played={finals.length}
          record={trackScoring ? seasonRecord(Array.from(scoresById.values())) : null}
        />
      )}

      {moreGames.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <Eyebrow>More upcoming</Eyebrow>
            <Link
              href={`/teams/${params.teamId}/games`}
              className="inline-flex items-center gap-1 text-xs font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
            >
              All games
              <SFIcon.chevronRight />
            </Link>
          </div>

          <div className="space-y-2">
            {moreGames.map((game) => (
              <UpcomingRow
                key={game.id}
                teamId={params.teamId}
                game={game}
                available={availMap.get(game.id) ?? 0}
                playerCount={playerCount}
              />
            ))}
          </div>
        </section>
      )}

      {!liveGame && !featuredGame && upcomingCount === 0 && isAdmin && (
        <SFCard>
          <Eyebrow>Get started</Eyebrow>
          <p className="mt-2 text-sm text-ink-dim">
            Add a game to start tracking availability and lineups.
          </p>
          <div className="mt-3">
            <SFButton href={`/teams/${params.teamId}/games`} variant="primary" size="sm">
              Add a game
            </SFButton>
          </div>
        </SFCard>
      )}
    </div>
  );
}

// ─── Live banner ─────────────────────────────────────────────────────────────

function LiveHero({ teamId, game, canRun }: { teamId: string; game: Game; canRun: boolean }) {
  return (
    <SFCard pad={0} className="overflow-hidden border-alarm/60">
      <div className="bg-ink px-5 py-5 text-warm sm:px-7 sm:py-6">
        <div className="flex items-center justify-between gap-3">
          <StatusPill status="live" />
          <span className="font-mono text-xs font-semibold tracking-[0.06em] text-warm/70">
            {game.round_number != null && `R${String(game.round_number).padStart(2, "0")} · `}
            In progress
          </span>
        </div>
        <div className="mt-4 flex items-baseline gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-micro text-warm/60">
            vs
          </span>
          <span className="text-2xl font-bold tracking-tightest text-warm sm:text-3xl">
            {game.opponent}
          </span>
        </div>
      </div>
      <div className="bg-surface px-5 py-3.5 sm:px-7 sm:py-4">
        {/* Link straight to /live, not the game-detail page. The
            detail page just has another "Open live game" button on
            it, so routing through it adds an extra tap for no value
            when there's an in-progress game (Steve 2026-05-13). */}
        <SFButton
          href={`/teams/${teamId}/games/${game.id}/live`}
          variant="alarm"
          full
          iconAfter={<SFIcon.chevronRight color="white" />}
        >
          {canRun ? "Back to live game" : "Watch live"}
        </SFButton>
      </div>
    </SFCard>
  );
}

/** From six hours before kickoff — matches the game hub's "Start game day". */
function isGameDay(game: Game): boolean {
  return Date.now() >= new Date(game.scheduled_at).getTime() - 6 * 60 * 60 * 1000;
}

// ─── To-dos ──────────────────────────────────────────────────────────────────

function TodoList({
  todos,
}: {
  todos: { id: string; label: string; detail: string; href: string }[];
}) {
  return (
    <section aria-label="To-do" className="space-y-2">
      <Eyebrow>To-do</Eyebrow>
      <SFCard pad={0}>
        <ul className="divide-y divide-hairline">
          {todos.map((t) => (
            <li key={t.id}>
              <Link
                href={t.href}
                className="flex min-h-[52px] items-center gap-3 px-4 py-3 transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{t.label}</span>
                  <span className="block text-xs text-ink-mute">{t.detail}</span>
                </span>
                <SFIcon.chevronRight />
              </Link>
            </li>
          ))}
        </ul>
      </SFCard>
    </section>
  );
}

// ─── Last result + season snapshot ───────────────────────────────────────────

function LastResult({
  teamId,
  game,
  score,
}: {
  teamId: string;
  game: Pick<Game, "id" | "opponent" | "scheduled_at" | "round_number">;
  /** null when the team doesn't keep score. */
  score: GameScore | null;
}) {
  const outcome = score ? outcomeOf(score) : null;
  const tone =
    outcome === "W" ? "bg-ok/10 text-ok" : outcome === "L" ? "bg-alarm-soft text-alarm" : "bg-surface-alt text-ink";
  return (
    <section aria-label="Last result">
      <Link href={`/teams/${teamId}/games/${game.id}#summary`} className="block">
        <SFCard interactive>
          <div className="flex items-center justify-between gap-3">
            <Eyebrow>
              Last result{game.round_number != null && ` · Round ${game.round_number}`}
            </Eyebrow>
            <span className="text-xs text-ink-mute">
              <FormattedDateTime iso={game.scheduled_at} mode="short" />
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            {outcome && (
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold ${tone}`}
              >
                {outcome}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-ink">vs {game.opponent}</div>
              {score?.usDetail && (
                <div className="font-mono text-xs text-ink-mute">
                  {score.usDetail} – {score.themDetail}
                </div>
              )}
            </div>
            {score ? (
              <span className="font-mono text-xl font-bold tabular-nums text-ink">
                {score.us}–{score.them}
              </span>
            ) : (
              <span className="text-xs text-ink-mute">Summary</span>
            )}
          </div>
        </SFCard>
      </Link>
    </section>
  );
}

function SeasonSnapshot({
  played,
  record,
}: {
  played: number;
  /** null when the team doesn't keep score. */
  record: { won: number; lost: number; drawn: number } | null;
}) {
  const items = [`${played} played`];
  if (record) {
    items.push(`${record.won} won`, `${record.lost} lost`);
    if (record.drawn > 0) items.push(`${record.drawn} drawn`);
  }
  return (
    <section aria-label="Season">
      <SFCard>
        <Eyebrow>Season</Eyebrow>
        <p className="mt-1.5 text-sm text-ink">{items.join(" · ")}</p>
      </SFCard>
    </section>
  );
}

// ─── Next-up hero ────────────────────────────────────────────────────────────

function NextUpHero({
  teamId,
  game,
  available,
  playerCount,
  canRun,
}: {
  teamId: string;
  game: Game;
  available: number;
  playerCount: number;
  canRun: boolean;
}) {
  const startsGameDay = canRun && isGameDay(game);
  return (
    <SFCard pad={0} className="overflow-hidden">
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-700 to-brand-800 px-5 py-6 text-warm sm:px-8 sm:py-8">
        {/* Decorative footy-field oval, top-right */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-8 opacity-[0.12]"
          width="240"
          height="260"
          viewBox="0 0 200 220"
          fill="none"
          stroke="currentColor"
        >
          <ellipse cx="100" cy="110" rx="80" ry="100" strokeWidth="1.5" />
          <ellipse cx="100" cy="110" rx="55" ry="75" strokeWidth="1" />
          <line x1="100" y1="35" x2="100" y2="185" strokeWidth="1" opacity="0.6" />
        </svg>

        <div className="relative">
          <Eyebrow className="!text-warm/70">
            Next up{game.round_number != null && ` · Round ${game.round_number}`}
          </Eyebrow>
          <div className="mt-2.5 flex items-start gap-4">
            {game.round_number != null && (
              <div className="text-warm">
                <RoundNumeral n={game.round_number} size={56} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-warm/70">vs</div>
              <div className="mt-0.5 text-2xl font-bold leading-tight tracking-tightest sm:text-3xl">
                {game.opponent}
              </div>
              <div className="mt-2 flex flex-col gap-1 text-sm text-warm/85">
                <span>
                  <FormattedDateTime iso={game.scheduled_at} mode="long" />
                </span>
                {game.location && (
                  <span className="inline-flex items-center gap-1">
                    <SFIcon.pin color="rgba(247,245,241,0.7)" />
                    <span>{game.location}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="text-sm text-ink-dim">
          <span className="font-mono text-base font-bold tabular-nums text-ink">
            {available}
          </span>
          <span className="text-ink-mute"> / {playerCount}</span>
          <span className="ml-1.5 font-mono text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
            avail
          </span>
        </div>
        {/* KickoffPulseWrapper renders a slow alarm-orange halo around
            the button when current time is within ±30min of kickoff —
            drawing the coach's eye to the action they almost certainly
            opened the page to take. Outside the window the wrapper is
            invisible, so this is free for upcoming games scheduled
            days in advance. The wrapper sets text-alarm on its
            container so the ring's currentColor halo paints in the
            brand siren-red. */}
        <KickoffPulseWrapper
          scheduledAt={game.scheduled_at}
          radius="md"
          className="w-full sm:w-auto"
        >
          {/* On game day the hero goes straight to the game-day screen —
              Today → Start game day → Start Q1 (UX plan §4 target). */}
          <SFButton
            href={
              startsGameDay
                ? `/teams/${teamId}/games/${game.id}/live`
                : `/teams/${teamId}/games/${game.id}`
            }
            variant="primary"
            iconAfter={<SFIcon.chevronRight color="currentColor" />}
            className="w-full sm:w-auto"
          >
            {startsGameDay ? "Start game day" : "Open game"}
          </SFButton>
        </KickoffPulseWrapper>
      </div>
    </SFCard>
  );
}

// ─── Empty state (admin, no upcoming) ────────────────────────────────────────

function EmptyHero({ teamId }: { teamId: string }) {
  return (
    <SFCard className="text-center">
      <Eyebrow>No upcoming games</Eyebrow>
      <p className="mt-2 text-sm text-ink-dim">
        Add your first game to start tracking availability and lineups.
      </p>
      <div className="mt-4">
        <SFButton
          href={`/teams/${teamId}/games`}
          variant="primary"
          iconAfter={<SFIcon.chevronRight color="currentColor" />}
        >
          Add a game
        </SFButton>
      </div>
    </SFCard>
  );
}

// ─── Compact upcoming row ────────────────────────────────────────────────────

function UpcomingRow({
  teamId,
  game,
  available,
  playerCount,
}: {
  teamId: string;
  game: Game;
  available: number;
  playerCount: number;
}) {
  return (
    <Link href={`/teams/${teamId}/games/${game.id}`} className="block">
      <SFCard
        pad={0}
        interactive
        className="grid grid-cols-[44px_1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[56px_1fr_auto_auto] sm:gap-5 sm:px-5 sm:py-3.5"
      >
        {game.round_number != null ? (
          <span
            className="font-serif italic leading-none text-ink"
            style={{ fontSize: 30, letterSpacing: "-0.02em" }}
          >
            {String(game.round_number).padStart(2, "0")}
          </span>
        ) : (
          <span aria-hidden="true" />
        )}

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 truncate text-base font-bold text-ink sm:text-[17px]">
            <span className="text-ink-mute font-medium">vs</span>
            <span className="truncate">{game.opponent}</span>
          </div>
          <div className="mt-1 text-xs text-ink-dim">
            <FormattedDateTime iso={game.scheduled_at} mode="short" />
            {game.location && ` · ${game.location}`}
          </div>
        </div>

        <div className="hidden text-right sm:block">
          <div className="font-mono text-sm font-bold tabular-nums text-ink">
            {available}
            <span className="text-ink-mute">/{playerCount}</span>
          </div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
            avail
          </div>
        </div>

        <span className="text-ink-mute">
          <SFIcon.chevronRight />
        </span>
      </SFCard>
    </Link>
  );
}
