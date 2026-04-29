import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow, SFButton, SFCard, SFIcon } from "@/components/sf";
import { ROLE_LABEL } from "@/lib/roles";
import type { Team, TeamRole } from "@/lib/types";

interface DashboardPageProps {
  searchParams: { welcome?: string };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const {
    data: { user },
  } = await getUser();

  if (!user) redirect("/login");

  type MembershipRow = {
    role: TeamRole;
    teams: Pick<Team, "id" | "name"> | null;
  };

  const { data: memberships } = await createClient()
    .from("team_memberships")
    .select("role, teams(id, name)")
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
    redirect("/welcome");
  }

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>Coach dashboard</Eyebrow>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tightest text-ink">
          My teams
        </h1>
        <p className="mt-1 text-sm text-ink-dim">
          Select a team to open its dashboard.
        </p>
      </header>

      {teams.length === 0 ? (
        <SFCard className="text-center">
          <p className="text-sm text-ink-mute">
            You haven&apos;t created or joined any teams yet.
          </p>
        </SFCard>
      ) : (
        <SFCard pad={0}>
          <ul className="divide-y divide-hairline">
            {teams.map((team) => (
              <li key={team.id}>
                <Link
                  href={`/teams/${team.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-4 transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
                >
                  <span className="truncate font-medium text-ink">
                    {team.name}
                  </span>
                  <span className="flex items-center gap-3">
                    <Badge variant={team.role}>{ROLE_LABEL[team.role]}</Badge>
                    <span className="text-ink-mute">
                      <SFIcon.chevronRight />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </SFCard>
      )}

      <SFButton
        href="/teams/new"
        variant="accent"
        full
        iconAfter={<SFIcon.chevronRight color="currentColor" />}
      >
        Create a new team
      </SFButton>
    </div>
  );
}
