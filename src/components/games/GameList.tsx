import { createClient } from "@/lib/supabase/server";
import type { Game, GameAvailability } from "@/lib/types";
import { GameRow } from "@/components/games/GameRow";

interface GameListProps {
  teamId: string;
  /** Filter from URL (`?filter=upcoming|final|all`). Defaults to all. */
  filter?: "all" | "upcoming" | "final";
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
export async function GameList({ teamId, filter = "all" }: GameListProps) {
  const supabase = createClient();

  const [{ data: games }, { count: activeCount }, { data: availability }] =
    await Promise.all([
      supabase
        .from("games")
        .select("*")
        .eq("team_id", teamId)
        .order("scheduled_at", { ascending: false }),
      supabase
        .from("players")
        .select("*", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("is_active", true),
      supabase
        .from("game_availability")
        .select("game_id, status")
        .eq("status", "available"),
    ]);

  const all = (games ?? []) as Game[];
  const totalActive = activeCount ?? 0;
  const availMap = new Map<string, number>();
  for (const row of (availability ?? []) as Pick<GameAvailability, "game_id" | "status">[]) {
    availMap.set(row.game_id, (availMap.get(row.game_id) ?? 0) + 1);
  }

  const active = all
    .filter((g) => g.status !== "completed")
    .sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );

  const completed = all
    .filter((g) => g.status === "completed")
    .sort(
      (a, b) =>
        new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
    );

  if (all.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-hairline bg-surface-alt px-4 py-8 text-center text-sm text-ink-mute">
        No games yet — create your first game above.
      </p>
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
        <p className="rounded-lg border border-dashed border-hairline bg-surface-alt px-4 py-8 text-center text-sm text-ink-mute">
          No upcoming games.
        </p>
      )}

      {filter === "final" && completed.length === 0 && (
        <p className="rounded-lg border border-dashed border-hairline bg-surface-alt px-4 py-8 text-center text-sm text-ink-mute">
          No completed games.
        </p>
      )}
    </div>
  );
}
