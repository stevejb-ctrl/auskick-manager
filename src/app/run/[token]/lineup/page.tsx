import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { LineupPicker } from "@/components/live/LineupPicker";
import { seasonZoneMinutes } from "@/lib/fairness";
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
  const ageCfg = AGE_GROUPS[ageGroup];
  const positionModel = ageCfg.positionModel;

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

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-3">
      <div>
        <Link
          href={`/run/${params.token}`}
          className="text-sm text-ink-dim transition-colors duration-fast ease-out-quart hover:text-brand-700"
        >
          ← Availability
        </Link>
      </div>

      <div>
        <h2 className="text-xl font-bold text-ink">
          {teamName} vs {g.opponent}
        </h2>
        <p className="mt-1 text-sm text-ink-dim">
          Starting lineup · {availablePlayers.length} available
        </p>
      </div>

      {availablePlayers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-hairline bg-surface-alt px-4 py-6 text-center text-sm text-ink-mute">
          No one&apos;s marked available yet. Go back and mark players available first.
        </p>
      ) : (
        <LineupPicker
          auth={auth}
          gameId={g.id}
          players={availablePlayers}
          season={season}
          defaultOnFieldSize={g.on_field_size}
          minOnFieldSize={ageCfg.minOnFieldSize}
          maxOnFieldSize={ageCfg.maxOnFieldSize}
          positionModel={positionModel}
        />
      )}
    </div>
  );
}
