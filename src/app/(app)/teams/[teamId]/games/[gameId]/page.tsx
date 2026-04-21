import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AvailabilityList } from "@/components/games/AvailabilityList";
import { ShareRunnerLink } from "@/components/games/ShareRunnerLink";
import { ResetGameButton } from "@/components/games/ResetGameButton";
import { DeleteGameButton } from "@/components/games/DeleteGameButton";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { Spinner } from "@/components/ui/Spinner";
import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";
import type { Game } from "@/lib/types";

interface GameDetailPageProps {
  params: { teamId: string; gameId: string };
}

export default async function GameDetailPage({ params }: GameDetailPageProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: game }, { data: membership }, { data: team }, { data: scoringEvents }, { data: players }] = await Promise.all([
    supabase
      .from("games")
      .select("*")
      .eq("id", params.gameId)
      .eq("team_id", params.teamId)
      .single(),
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
      .select("age_group")
      .eq("id", params.teamId)
      .single(),
    supabase
      .from("game_events")
      .select("type, player_id")
      .eq("game_id", params.gameId)
      .in("type", ["goal", "behind"]),
    supabase
      .from("players")
      .select("id, full_name, jersey_number")
      .eq("team_id", params.teamId),
  ]);

  if (!game) notFound();

  const g = game as Game;
  const role = membership?.role;
  const canEdit = role === "admin" || role === "game_manager";
  const canRun = canEdit;
  const ageGroup = ageGroupOf((team as { age_group?: string } | null)?.age_group);
  const ageCfg = AGE_GROUPS[ageGroup];

  const tallies = new Map<string, { goals: number; behinds: number }>();
  for (const ev of (scoringEvents ?? []) as { type: string; player_id: string | null }[]) {
    if (!ev.player_id) continue;
    const cur = tallies.get(ev.player_id) ?? { goals: 0, behinds: 0 };
    if (ev.type === "goal") cur.goals++;
    else if (ev.type === "behind") cur.behinds++;
    tallies.set(ev.player_id, cur);
  }
  const playerById = new Map(
    ((players ?? []) as { id: string; full_name: string; jersey_number: number }[]).map((p) => [p.id, p])
  );
  const scorerRows = Array.from(tallies.entries())
    .map(([pid, t]) => ({ player: playerById.get(pid), ...t }))
    .filter((r) => r.player)
    .sort((a, b) => b.goals - a.goals || b.behinds - a.behinds);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/teams/${params.teamId}/games`}
          className="text-sm text-ink-dim transition-colors duration-fast ease-out-quart hover:text-brand-700"
        >
          ← Games
        </Link>
      </div>

      <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
        <div className="flex items-baseline gap-2">
          {g.round_number != null && (
            <span className="text-[11px] font-bold uppercase tracking-micro text-brand-700">
              Round {g.round_number}
            </span>
          )}
          <span className="text-xs text-ink-mute">
            <FormattedDateTime iso={g.scheduled_at} mode="long" />
          </span>
        </div>
        <h2 className="mt-1 text-xl font-bold text-ink">vs {g.opponent}</h2>
        {g.location && <p className="mt-1 text-sm text-ink-dim">{g.location}</p>}
        <p className="mt-1 text-xs text-ink-mute">
          {ageCfg.label} · {g.on_field_size} on field
          {g.on_field_size < ageCfg.defaultOnFieldSize && (
            <span className="ml-1 font-medium text-warn">(short-handed)</span>
          )}
        </p>
        {g.notes && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-ink-dim">{g.notes}</p>
        )}
        {canRun && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/teams/${params.teamId}/games/${params.gameId}/live`}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
            >
              {g.status === "upcoming" ? "Start game" : "Open live game"}
            </Link>
            {role === "admin" && <ShareRunnerLink token={g.share_token} />}
            {role === "admin" && g.status !== "upcoming" && (
              <ResetGameButton auth={{ kind: "team", teamId: params.teamId }} gameId={params.gameId} />
            )}
            {role === "admin" && (
              <DeleteGameButton teamId={params.teamId} gameId={params.gameId} />
            )}
          </div>
        )}
      </div>

      {scorerRows.length > 0 && (
        <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
          <h3 className="text-base font-semibold text-ink">Goal kickers</h3>
          <ul className="mt-3 divide-y divide-hairline">
            {scorerRows.map((r) => (
              <li
                key={r.player!.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 tabular-nums">
                    {r.player!.jersey_number}
                  </span>
                  <span className="font-medium text-ink">
                    {r.player!.full_name}
                  </span>
                </span>
                <span className="tabular-nums text-ink-dim">
                  <span className="font-semibold text-ink">{r.goals}</span> goals ·{" "}
                  <span className="font-semibold text-ink">{r.behinds}</span> behinds
                  <span className="ml-1 text-xs text-ink-mute">
                    ({r.goals * 6 + r.behinds} pts)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        }
      >
        <AvailabilityList
          auth={{ kind: "team", teamId: params.teamId }}
          teamId={params.teamId}
          gameId={params.gameId}
          canEdit={canEdit}
        />
      </Suspense>
    </div>
  );
}
