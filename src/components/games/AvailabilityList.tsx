import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AvailabilityStatus,
  FillIn,
  GameAvailability,
  LiveAuth,
  Player,
} from "@/lib/types";
import { AvailabilityRow } from "@/components/games/AvailabilityRow";
import { AddFillInForm } from "@/components/games/AddFillInForm";
import { FillInRow } from "@/components/games/FillInRow";

interface AvailabilityListProps {
  auth: LiveAuth;
  teamId: string;
  gameId: string;
  canEdit: boolean;
}

export async function AvailabilityList({ auth, teamId, gameId, canEdit }: AvailabilityListProps) {
  const supabase = auth.kind === "token" ? createAdminClient() : createClient();

  const [{ data: players }, { data: availability }, { data: fillInRows }] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("jersey_number"),
    supabase.from("game_availability").select("*").eq("game_id", gameId),
    supabase
      .from("game_fill_ins")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at"),
  ]);

  const squad = (players ?? []) as Player[];
  const fillIns = (fillInRows ?? []) as FillIn[];
  const availMap = new Map<string, AvailabilityStatus>();
  for (const row of (availability ?? []) as GameAvailability[]) {
    availMap.set(row.player_id, row.status);
  }

  let available = 0;
  let unavailable = 0;
  for (const p of squad) {
    const s = availMap.get(p.id) ?? "unknown";
    if (s === "available") available++;
    else unavailable++;
  }
  // Fill-ins are always available — addFillIn stamps an availability row for them.
  available += fillIns.length;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-sm">
        <span className="inline-flex items-center gap-1 rounded-full border border-ok/30 bg-ok/10 px-3 py-1 font-semibold text-ok">
          {available} available
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-alt px-3 py-1 font-semibold text-ink-mute">
          {unavailable} unavailable
        </span>
      </div>

      <div className="rounded-lg border border-hairline bg-surface shadow-card">
        {squad.length === 0 && fillIns.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-mute">
            No active players in the squad.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
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
            {fillIns.map((f) => (
              <FillInRow
                key={f.id}
                auth={auth}
                gameId={gameId}
                fillInId={f.id}
                fullName={f.full_name}
                jerseyNumber={f.jersey_number}
                canEdit={canEdit}
              />
            ))}
          </ul>
        )}
        {canEdit && <AddFillInForm auth={auth} gameId={gameId} />}
      </div>
    </div>
  );
}
