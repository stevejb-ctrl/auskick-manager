import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { FinishSetupBanner } from "@/components/setup/FinishSetupBanner";
import {
  Eyebrow,
  RoundNumeral,
  SFCard,
  SFButton,
  SFIcon,
  StatusPill,
} from "@/components/sf";
import type { Game } from "@/lib/types";

interface TeamDashboardProps {
  params: { teamId: string };
}

/**
 * Team Home — the coach's landing page after picking a team.
 *
 * Layout (matches design_handoff_siren_footy/prototype/sf/screens.jsx):
 *   1. Finish-setup banner (admins on empty squads only)
 *   2. Hero — Live banner if a game is in_progress, else Next-up hero
 *   3. Upcoming list — compact GameRow-style cards for everything
 *      after the next game
 *
 * The Season Pulse triplet (Record / Ladder / Form) and Last Result
 * card from the design are deferred until the upstream queries land:
 * Record + Form would need a sweep over completed games, Ladder isn't
 * surfaced anywhere in the data model yet.
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
  ]);

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
  const showSetupBanner = isAdmin && playerCount === 0;

  const availMap = new Map<string, number>();
  for (const row of availabilityRaw ?? []) {
    availMap.set(row.game_id, (availMap.get(row.game_id) ?? 0) + 1);
  }

  const liveGame = upcoming.find((g) => g.status === "in_progress");
  const nextGames = upcoming.filter((g) => g.status !== "in_progress");
  const [featuredGame, ...moreGames] = nextGames;

  return (
    <div className="space-y-4">
      {showSetupBanner && <FinishSetupBanner teamId={params.teamId} />}

      {liveGame ? (
        <LiveHero teamId={params.teamId} game={liveGame} />
      ) : featuredGame ? (
        <NextUpHero
          teamId={params.teamId}
          game={featuredGame}
          available={availMap.get(featuredGame.id) ?? 0}
          playerCount={playerCount}
        />
      ) : (
        <EmptyHero teamId={params.teamId} />
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

function LiveHero({ teamId, game }: { teamId: string; game: Game }) {
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
        <SFButton
          href={`/teams/${teamId}/games/${game.id}`}
          variant="alarm"
          full
          iconAfter={<SFIcon.chevronRight color="white" />}
        >
          Open live game
        </SFButton>
      </div>
    </SFCard>
  );
}

// ─── Next-up hero ────────────────────────────────────────────────────────────

function NextUpHero({
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
        <SFButton
          href={`/teams/${teamId}/games/${game.id}`}
          variant="primary"
          iconAfter={<SFIcon.chevronRight color="currentColor" />}
          className="w-full sm:w-auto"
        >
          Set starting lineup
        </SFButton>
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
