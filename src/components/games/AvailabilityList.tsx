import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AvailabilityStatus,
  GameAvailability,
  LiveAuth,
  Player,
} from "@/lib/types";
import { AvailabilityRow } from "@/components/games/AvailabilityRow";

interface AvailabilityListProps {
  auth: LiveAuth;
  teamId: string;
  gameId: string;
  canEdit: boolean;
}

export async function AvailabilityList({ auth, teamId, gameId, canEdit }: AvailabilityListProps) {
  const supabase = auth.kind === "token" ? createAdminClient() : createClient();

  const [{ data: players }, { data: availability }] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("jersey_number"),
    supabase.from("game_availability").select("*").eq("game_id", gameId),
  ]);

  const squad = (players ?? []) as Player[];
  const availMap = new Map<string, AvailabilityStatus>();
  for (const row of (availability ?? []) as GameAvailability[]) {
    availMap.set(row.player_id, row.status);
  }

  let available = 0;
  let unavailable = 0;
  let unknown = 0;
  for (const p of squad) {
    const s = availMap.get(p.id) ?? "unknown";
    if (s === "available") available++;
    else if (s === "unavailable") unavailable++;
    else unknown++;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-sm">
        <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-100 px-3 py-1 font-semibold text-green-700">
          {available} available
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-3 py-1 font-semibold text-red-700">
          {unavailable} unavailable
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-3 py-1 font-semibold text-gray-600">
          {unknown} unknown
        </span>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {squad.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            No active players in the squad.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {squad.map((p) => (
              <AvailabilityRow
                key={p.id}
                auth={auth}
                gameId={gameId}
                playerId={p.id}
                playerName={p.full_name}
                jerseyNumber={p.jersey_number}
                status={availMap.get(p.id) ?? "unknown"}
                canEdit={canEdit}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
