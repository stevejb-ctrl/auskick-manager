import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { runLinkTitle } from "@/lib/share/runLinkTitle";
import { DeviceFrame } from "@/components/DeviceFrame";
import { createAdminClient } from "@/lib/supabase/admin";
import { SquadNamesProvider } from "@/components/live/SquadNames";
import { loadSquadNames } from "@/lib/live/loadSquadNames";
import type { NamedPlayer } from "@/lib/names";
import { GameGoneWatcher } from "@/components/live/GameGoneWatcher";
import { RunWhoseProvider, type RunWhose } from "@/components/live/RunWhose";
import { getSportConfig, teamSport } from "@/lib/sports";
import { teamAgeGroup } from "@/lib/sports/teamAgeGroup";

// Back-target resolution. /run/{token} is reached by two distinct
// audiences:
//
//   1. Demo visitors — landed via the /demo picker. Back should
//      return them to /demo so they can try another sport without
//      retracing through the homepage.
//
//   2. Real parent-runners — handed the run-token by a coach for
//      live scoring. They have nowhere meaningful to "go back" to;
//      the homepage / marketing site is the safe default.
//
// We discriminate by querying the team behind the token's game:
// teams.is_demo is the same flag the /demo picker keys off when
// finding the demo team to start a game against.
//
// The same read finds the squad, so the runner's tiles and sheets tell
// two kids with the same short name apart (SquadNamesProvider).
// Whose game this is goes to the live top bar (RunWhose).
type Whose = RunWhose;

async function resolveBackTarget(
  token: string,
): Promise<{ backHref: string; players: NamedPlayer[]; gameId: string | null; whose: Whose | null }> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("games")
    .select("id, team_id, opponent, status, team:teams!inner(is_demo, name, sport, age_group, period_count)")
    .eq("share_token", token)
    .maybeSingle();

  // Defensive default: invalid tokens, lookup failures, or any
  // non-demo team fall through to the homepage. Only confirmed
  // demo games get the /demo back-target.
  const teamRow = row?.team as
    | { is_demo: boolean | null; name: string | null; sport: string; age_group: string | null; period_count: number | null }
    | undefined;
  const players = row ? await loadSquadNames(admin, row.team_id as string, row.id as string) : [];
  const whose: Whose | null = teamRow
    ? (() => {
        const sport = teamSport(teamRow.sport);
        let age: string | null = null;
        try {
          age = teamAgeGroup(sport, teamRow.age_group, teamRow.period_count).label;
        } catch {}
        return {
          team: teamRow.name ?? "your team",
          opponent: (row?.opponent as string | null) ?? null,
          what: [age, getSportConfig(sport).shortName].filter(Boolean).join(" · "),
          finished: row?.status === "completed",
        };
      })()
    : null;
  return { backHref: teamRow?.is_demo ? "/demo" : "/", players, gameId: (row?.id as string | undefined) ?? null, whose };
}

// The tab, and the link preview in the group chat, name the game: the
// site's title is the host's brand, so a basketball or hockey link read
// "Siren Footy" (Stagehand round 7, 28 Oct 2026).
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const { data } = await createAdminClient()
    .from("games")
    .select("opponent, team:teams!inner(name)")
    .eq("share_token", params.token)
    .maybeSingle();
  const team = (data?.team as { name: string | null } | undefined)?.name;
  return data && team ? { title: runLinkTitle(team, data.opponent as string | null) } : {};
}

export default async function RunLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { token: string };
}) {
  noStore();
  const { backHref, players, gameId, whose } = await resolveBackTarget(params.token);

  // No header of its own (design review, Oct 2026): every screen on the
  // link opens with LiveTopBar, which says whose game it is (RunWhose)
  // and owns the one way out, EXIT. The old banner above it took 16% of
  // the phone, and its "‹ Siren" went to the homepage mid-game. The EXIT
  // page (/left) links home, or back to the demo picker for demo games.
  return (
    <div>
      <DeviceFrame>
        <main>
          <RunWhoseProvider whose={whose}>
            <SquadNamesProvider players={players}>{children}</SquadNamesProvider>
          </RunWhoseProvider>
          {/* The coach deleting the game (or replacing the link) shows here. */}
          {gameId && <GameGoneWatcher auth={{ kind: "token", token: params.token }} gameId={gameId} exitHref={backHref} />}
        </main>
      </DeviceFrame>
    </div>
  );
}
