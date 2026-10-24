import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow, SFCard, SFIcon } from "@/components/sf";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { ROLE_LABEL } from "@/lib/roles";
import { getAgeGroupConfig, getSportConfig, teamSport } from "@/lib/sports";
import type { Sport, Team, TeamRole } from "@/lib/types";
import { StatusNotice } from "@/components/team/StatusNotice";

interface DashboardPageProps {
  /** left: the team just left (LeaveTeamButton), for "You left …". */
  searchParams: { welcome?: string; list?: string; left?: string };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const {
    data: { user },
  } = await getUser();

  if (!user) redirect("/login");

  type MembershipRow = {
    role: TeamRole;
    teams: (Pick<Team, "id" | "name"> & { sport: Sport | null; age_group: string | null }) | null;
  };

  const supabase = createClient();
  const { data: memberships } = await supabase
    .from("team_memberships")
    .select("role, teams(id, name, sport, age_group)")
    .eq("user_id", user.id)
    .returns<MembershipRow[]>();

  const teams = (memberships ?? []).flatMap((m) =>
    m.teams ? [{ ...m.teams, role: m.role }] : [],
  );

  // First-time user redirect.  If they have no teams and haven't
  // explicitly skipped the welcome (?welcome=skipped), send them to
  // the warmer /welcome screen.  Skipping sets the query param so the
  // empty-state dashboard still works as an escape hatch.
  if (teams.length === 0 && searchParams.welcome !== "skipped") {
    redirect(searchParams.left ? `/welcome?left=${encodeURIComponent(searchParams.left)}` : "/welcome");
  }

  // Single-team auto-redirect (Steve 2026-05-13). Most coaches only
  // run one team, so the multi-team list is a wasted tap. Drop them
  // straight into the team home. Multi-team users still see the
  // list when they navigate here explicitly (e.g. to switch teams
  // or create another). The auth-route bounce in middleware also
  // handles the login case via the last-accessed-team cookie, but
  // this branch covers the first-time-login case where no cookie
  // exists yet.
  //
  // Escape hatch: `?list=1` keeps the team list visible even for
  // single-team users. The UserMenu's "Switch team" link uses this
  // so coaches who only have one team can still get back to the
  // list to create another, view the full team picker, etc.
  // (Steve 2026-05-19: super-admin couldn't escape the single-team
  // loop once auto-redirected into Kotara Koalas.)
  if (teams.length === 1 && searchParams.list !== "1") {
    redirect(`/teams/${teams[0].id}`);
  }

  // Next game per team, for the cards. Teams are queried in chunks so
  // neither the URL nor PostgREST's row cap truncates a long team list.
  const nextByTeam = new Map<string, { opponent: string; scheduled_at: string; status: string }>();
  const ids = teams.map((t) => t.id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("games")
        .select("team_id, opponent, scheduled_at, status")
        .in("team_id", chunk)
        .neq("status", "completed")
        .order("scheduled_at", { ascending: true }),
    ),
  );
  for (const { data: upcoming } of results) {
    for (const g of upcoming ?? []) {
      if (!nextByTeam.has(g.team_id)) nextByTeam.set(g.team_id, g);
    }
  }

  return (
    <div className="space-y-6">
      {searchParams.left && <StatusNotice>{`You left ${searchParams.left}.`}</StatusNotice>}
      <header>
        <Eyebrow>Coach dashboard</Eyebrow>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tightest text-ink">
          My teams
        </h1>
        <p className="mt-1 text-sm text-ink-dim">
          Pick a team to open Today.
        </p>
      </header>

      {teams.length === 0 ? (
        <SFCard className="text-center">
          <p className="text-sm text-ink-mute">
            You haven&apos;t created or joined any teams yet.
          </p>
        </SFCard>
      ) : (
        // One card per team: sport · age group, and the next game, so a
        // coach with two teams can tell them apart at a glance (UX plan M1).
        <ul className="space-y-2">
          {teams.map((team) => {
            const sport = teamSport(team.sport);
            const sportName = getSportConfig(sport).shortName;
            const ageLabel = getAgeGroupConfig(sport, team.age_group).label;
            const next = nextByTeam.get(team.id);
            return (
              <li key={team.id}>
                <Link href={`/teams/${team.id}`} className="block">
                  <SFCard interactive>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-ink">{team.name}</p>
                        <p className="text-xs text-ink-mute">
                          {sportName} · {ageLabel}
                        </p>
                        <p className="mt-2 text-sm text-ink-dim">
                          {next ? (
                            <>
                              {next.status === "in_progress" ? "Live now" : "Next"} · vs{" "}
                              {next.opponent} ·{" "}
                              <FormattedDateTime iso={next.scheduled_at} mode="short" />
                            </>
                          ) : (
                            "No games scheduled"
                          )}
                        </p>
                      </div>
                      <Badge variant={team.role}>{ROLE_LABEL[team.role]}</Badge>
                      <span className="self-center text-ink-mute">
                        <SFIcon.chevronRight />
                      </span>
                    </div>
                  </SFCard>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Creating or joining another team is a secondary action for a
          returning coach — the primary job here is opening a team. */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold">
        <Link href="/teams/new" className="text-brand-700 hover:underline">
          + New team
        </Link>
        <Link href="/join-team" className="text-brand-700 hover:underline">
          Join with a code
        </Link>
      </div>

      {/* Secondary link to /account. Mirrors the avatar menu in the
          (app) header — same destination, two entry points so users
          coming straight to the dashboard from a deep link don't have
          to hunt for account settings. */}
      <p className="text-center text-xs text-ink-mute">
        <Link
          href="/account"
          className="font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
        >
          My account
        </Link>
      </p>
    </div>
  );
}
