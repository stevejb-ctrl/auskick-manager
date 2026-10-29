import { createClient } from "@/lib/supabase/server";
import type { Game, GameAvailability } from "@/lib/types";
import { GameRow } from "@/components/games/GameRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotPlayedGames } from "@/components/games/NotPlayedGames";
import { splitByNotPlayed } from "@/lib/games/notPlayed";
import { availableCountsByGame } from "@/lib/games/availableCounts";

interface GameListProps {
  teamId: string;
  /** Filter from URL (`?filter=upcoming|final|all`). Defaults to all. */
  filter?: "all" | "upcoming" | "final";
  /** Coaches can delete or mark played a game that wasn't run. */
  canEdit?: boolean;
}

/**
 * Games list. Reads all games for the team and groups by status.
 *
 * In-progress games stay in the "Upcoming" group so the manager can
 * navigate to the live view from the same place they were before.
 *
 * The filter prop is passed in from the page server-component, sourced
 * from URL search params — keeps the list bookmarkable.
 */
export async function GameList({ teamId, filter = "all", canEdit = false }: GameListProps) {
  const supabase = createClient();

  const [{ data: games }, { data: activePlayers }] = await Promise.all([
    supabase
      .from("games")
      .select("*")
      .eq("team_id", teamId)
      .order("scheduled_at", { ascending: false }),
    supabase.from("players").select("id").eq("team_id", teamId).eq("is_active", true),
  ]);

  const all = (games ?? []) as Game[];
  const activeIds = (activePlayers ?? []).map((p) => p.id as string);
  const totalActive = activeIds.length;
  // This team's games only, and only kids still in the squad: a kid
  // switched off keeps their rows, which read "16/15".
  const { data: availability } = all.length
    ? await supabase
        .from("game_availability")
        .select("game_id, player_id, status")
        .eq("status", "available")
        .in("game_id", all.map((g) => g.id))
    : { data: [] };
  const availMap = availableCountsByGame(
    (availability ?? []) as Pick<GameAvailability, "game_id" | "player_id" | "status">[],
    activeIds,
  );

  // A game well past its start that was never run moves out of Upcoming
  // to Not played, with the past (lib/games/notPlayed).
  const { next: active, notPlayed } = splitByNotPlayed(
    all.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
  );

  const completed = all
    .filter((g) => g.status === "completed")
    .sort(
      (a, b) =>
        new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
    );

  if (all.length === 0) {
    return (
      <EmptyState title="No games yet" description="Create your first game above." />
    );
  }

  const showActive = filter === "all" || filter === "upcoming";
  const showCompleted = filter === "all" || filter === "final";

  return (
    <div className="space-y-6">
      {showActive && active.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-micro text-ink-mute">
            Upcoming
          </h2>
          <div className="space-y-2">
            {active.map((game) => (
              <GameRow
                key={game.id}
                teamId={teamId}
                game={game}
                availableCount={availMap.get(game.id) ?? 0}
                totalActive={totalActive}
              />
            ))}
          </div>
        </section>
      )}

      {showCompleted && (
        <NotPlayedGames teamId={teamId} games={[...notPlayed].reverse()} canEdit={canEdit} />
      )}

      {showCompleted && completed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-micro text-ink-mute">
            Completed
          </h2>
          <div className="space-y-2">
            {completed.map((game) => (
              <GameRow
                key={game.id}
                teamId={teamId}
                game={game}
                availableCount={availMap.get(game.id) ?? 0}
                totalActive={totalActive}
              />
            ))}
          </div>
        </section>
      )}

      {filter === "upcoming" && active.length === 0 && (
        <EmptyState title="No upcoming games." />
      )}

      {filter === "final" && completed.length === 0 && (
        <EmptyState title="No completed games." />
      )}
    </div>
  );
}
