import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { FinishSetupBanner } from "@/components/setup/FinishSetupBanner";
import type { Game } from "@/lib/types";

interface TeamDashboardProps {
  params: { teamId: string };
}

// ─── Icons (Heroicons-style outlines) ────────────────────────────────────────

function UsersIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-5 w-5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-5 w-5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z"
      />
    </svg>
  );
}

function ChartBarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-5 w-5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
      />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-5 w-5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className ?? "h-4 w-4"}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </svg>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function TeamDashboardPage({ params }: TeamDashboardProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: upcomingRaw },
    { count: totalActive },
    { count: upcomingTotal },
    { data: availabilityRaw },
    { data: membership },
  ] = await Promise.all([
    // Next 3 non-completed games (ascending so next game is first)
    supabase
      .from("games")
      .select("*")
      .eq("team_id", params.teamId)
      .neq("status", "completed")
      .order("scheduled_at", { ascending: true })
      .limit(3),

    // Active player count
    supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("team_id", params.teamId)
      .eq("is_active", true),

    // Total upcoming (for nav tile subtitle)
    supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("team_id", params.teamId)
      .neq("status", "completed"),

    // Availability for those games
    supabase
      .from("game_availability")
      .select("game_id, status")
      .eq("status", "available"),

    // Current user's role on this team (to gate the FinishSetupBanner)
    user
      ? supabase
          .from("team_memberships")
          .select("role")
          .eq("team_id", params.teamId)
          .eq("user_id", user.id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const upcoming = (upcomingRaw ?? []) as Game[];
  const playerCount = totalActive ?? 0;
  const upcomingCount = upcomingTotal ?? 0;
  const isAdmin = membership?.role === "admin";
  const showSetupBanner = isAdmin && playerCount === 0;

  const availMap = new Map<string, number>();
  for (const row of availabilityRaw ?? []) {
    availMap.set(row.game_id, (availMap.get(row.game_id) ?? 0) + 1);
  }

  // Separate live game from the upcoming list
  const liveGame = upcoming.find((g) => g.status === "in_progress");
  const nextGames = upcoming.filter((g) => g.status !== "in_progress");
  const [featuredGame, ...moreGames] = nextGames;

  const navTiles = [
    {
      label: "Squad",
      sub: playerCount === 1 ? "1 player" : `${playerCount} players`,
      href: `/teams/${params.teamId}/squad`,
      icon: <UsersIcon />,
    },
    {
      label: "Games",
      sub:
        upcomingCount === 0
          ? "No upcoming games"
          : upcomingCount === 1
          ? "1 upcoming"
          : `${upcomingCount} upcoming`,
      href: `/teams/${params.teamId}/games`,
      icon: <CalendarIcon />,
    },
    {
      label: "Stats",
      sub: "Season analysis",
      href: `/teams/${params.teamId}/stats`,
      icon: <ChartBarIcon />,
    },
    {
      label: "Settings",
      sub: "Team preferences",
      href: `/teams/${params.teamId}/settings`,
      icon: <CogIcon />,
    },
  ];

  return (
    <div className="space-y-6">

      {/* ── Finish setup banner (admins, empty squad) ────────────────────── */}
      {showSetupBanner && <FinishSetupBanner teamId={params.teamId} />}

      {/* ── Live game banner ─────────────────────────────────────────────── */}
      {liveGame && (
        <Link
          href={`/teams/${params.teamId}/games/${liveGame.id}`}
          className="flex items-center justify-between rounded-lg bg-brand-600 px-4 py-4 shadow-pop transition-opacity hover:opacity-95 active:opacity-90"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-micro text-brand-100">
                Game in progress
              </p>
              <p className="text-lg font-bold leading-tight text-white">
                vs {liveGame.opponent}
              </p>
              {liveGame.round_number != null && (
                <p className="text-sm text-brand-200">Round {liveGame.round_number}</p>
              )}
            </div>
          </div>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-brand-200" />
        </Link>
      )}

      {/* ── Upcoming games ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-micro text-ink-mute">
            Upcoming
          </h2>
          <Link
            href={`/teams/${params.teamId}/games`}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            All games
            <ArrowRightIcon />
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <div className="rounded-lg border border-dashed border-hairline bg-surface-alt px-4 py-8 text-center">
            <p className="text-sm text-ink-mute">No upcoming games scheduled.</p>
            <Link
              href={`/teams/${params.teamId}/games`}
              className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Add a game
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Featured next game */}
            {featuredGame && (
              <Link
                href={`/teams/${params.teamId}/games/${featuredGame.id}`}
                className="block rounded-lg border border-hairline bg-surface p-4 shadow-card transition-colors hover:border-brand-200 hover:bg-brand-50/20 active:bg-brand-50/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {featuredGame.round_number != null && (
                        <span className="text-[11px] font-semibold uppercase tracking-micro text-brand-600">
                          Round {featuredGame.round_number}
                        </span>
                      )}
                      <span className="text-xs text-ink-mute">
                        <FormattedDateTime iso={featuredGame.scheduled_at} mode="long" />
                      </span>
                    </div>
                    <p className="mt-1 text-lg font-bold leading-snug text-ink">
                      vs {featuredGame.opponent}
                    </p>
                    {featuredGame.location && (
                      <p className="mt-0.5 truncate text-sm text-ink-dim">
                        {featuredGame.location}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-2xl font-bold tabular-nums leading-none text-brand-600">
                      {availMap.get(featuredGame.id) ?? 0}
                    </span>
                    <span className="text-sm text-ink-mute">/{playerCount}</span>
                    <p className="mt-0.5 text-[10px] uppercase tracking-micro text-ink-mute">
                      avail
                    </p>
                  </div>
                </div>
              </Link>
            )}

            {/* Subsequent games — compact rows */}
            {moreGames.map((game) => (
              <Link
                key={game.id}
                href={`/teams/${params.teamId}/games/${game.id}`}
                className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-3 shadow-card transition-colors hover:border-brand-200 hover:bg-brand-50/20 active:bg-brand-50/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {game.round_number != null && (
                      <span className="text-[11px] font-semibold uppercase tracking-micro text-brand-600">
                        Rnd {game.round_number}
                      </span>
                    )}
                    <span className="truncate font-medium text-ink">
                      vs {game.opponent}
                    </span>
                  </div>
                  <p className="text-xs text-ink-mute">
                    <FormattedDateTime iso={game.scheduled_at} mode="short" />
                    {game.location && ` · ${game.location}`}
                  </p>
                </div>
                <div className="ml-3 shrink-0 text-right">
                  <span className="text-sm font-semibold tabular-nums text-brand-600">
                    {availMap.get(game.id) ?? 0}
                  </span>
                  <span className="text-xs text-ink-mute">/{playerCount}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Nav tiles ────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-micro text-ink-mute">
          Team
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {navTiles.map((tile) => (
            <Link
              key={tile.label}
              href={tile.href}
              className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-4 shadow-card transition-colors hover:border-brand-200 hover:bg-brand-50/20 active:bg-brand-50/40"
            >
              <div className="flex items-start justify-between">
                <div className="rounded-md bg-brand-50 p-2 text-brand-600">
                  {tile.icon}
                </div>
                <ChevronRightIcon className="h-4 w-4 text-ink-mute" />
              </div>
              <div>
                <p className="font-semibold text-ink">{tile.label}</p>
                <p className="mt-0.5 text-xs text-ink-dim">{tile.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
