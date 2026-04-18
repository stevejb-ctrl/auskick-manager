import { createClient } from "@/lib/supabase/server";
import type { Game, GameAvailability } from "@/lib/types";
import { GameCard } from "@/components/games/GameCard";

interface GameListProps {
  teamId: string;
}

export async function GameList({ teamId }: GameListProps) {
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

  const now = Date.now();
  const upcoming = all
    .filter((g) => new Date(g.scheduled_at).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const past = all.filter((g) => new Date(g.scheduled_at).getTime() < now);

  if (all.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
        No games yet — create your first game above.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Upcoming
          </h2>
          <div className="space-y-2">
            {upcoming.map((game) => (
              <GameCard
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

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Past
          </h2>
          <div className="space-y-2">
            {past.map((game) => (
              <GameCard
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
    </div>
  );
}
