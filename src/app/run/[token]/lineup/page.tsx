import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { LineupPicker } from "@/components/live/LineupPicker";
import { seasonZoneMinutes, suggestStartingLineup, zoneCapsFor } from "@/lib/fairness";
import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";

export const dynamic = "force-dynamic";

interface LineupPageProps {
  params: { token: string };
}

export default async function LineupPage({ params }: LineupPageProps) {
  const admin = createAdminClient();

  const { data: game } = await admin
    .from("games")
    .select("*")
    .eq("share_token", params.token)
    .maybeSingle();
  if (!game) notFound();
  const g = game as Game;

  const { data: teamRow } = await admin
    .from("teams")
    .select("name, age_group")
    .eq("id", g.team_id)
    .single();
  const teamName = teamRow?.name ?? "Team";
  const ageGroup = ageGroupOf((teamRow as { age_group?: string } | null)?.age_group);
  const positionModel = AGE_GROUPS[ageGroup].positionModel;

  const auth: LiveAuth = { kind: "token", token: params.token };

  const [{ data: avail }, { data: players }, { data: teamGames }] =
    await Promise.all([
      admin
        .from("game_availability")
        .select("player_id, status")
        .eq("game_id", g.id)
        .eq("status", "available"),
      admin
        .from("players")
        .select("*")
        .eq("team_id", g.team_id)
        .eq("is_active", true)
        .order("jersey_number"),
      admin.from("games").select("id").eq("team_id", g.team_id),
    ]);

  const allActive = (players ?? []) as Player[];
  const availableIds = new Set((avail ?? []).map((a) => a.player_id));
  const availablePlayers = allActive.filter((p) => availableIds.has(p.id));
  const otherGameIds = (teamGames ?? [])
    .map((t) => t.id)
    .filter((id) => id !== g.id);
  const { data: seasonEvents } = otherGameIds.length
    ? await admin.from("game_events").select("*").in("game_id", otherGameIds)
    : { data: [] as GameEvent[] };
  const season = seasonZoneMinutes((seasonEvents ?? []) as GameEvent[]);
  const zoneCaps = zoneCapsFor(g.on_field_size, positionModel);
  const suggested = suggestStartingLineup(availablePlayers, season, 0, zoneCaps);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-3">
      <div>
        <Link
          href={`/run/${params.token}`}
          className="text-sm text-gray-500 hover:text-brand-600"
        >
          ← Availability
        </Link>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900">
          {teamName} vs {g.opponent}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Starting lineup · {availablePlayers.length} available
        </p>
      </div>

      {availablePlayers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          No one&apos;s marked available yet. Go back and mark players available first.
        </p>
      ) : (
        <LineupPicker
          auth={auth}
          gameId={g.id}
          players={availablePlayers}
          suggestedLineup={suggested}
          season={season}
          zoneCaps={zoneCaps}
          onFieldSize={g.on_field_size}
          positionModel={positionModel}
        />
      )}
    </div>
  );
}
