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

  // Single-team auto-redirect (Steve 2026-05-13). Most coaches only
  // run one team, so the multi-team list is a wasted tap. Drop them
  // straight into the team home. Multi-team users still see the
  // list when they navigate here explicitly (e.g. to switch teams
  // or create another). The auth-route bounce in middleware also
  // handles the login case via the last-accessed-team cookie, but
  // this branch covers the first-time-login case where no cookie
  // exists yet.
  if (teams.length === 1) {
    redirect(`/teams/${teams[0].id}`);
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

      {/* Secondary "Join with a code" CTA — mirrors the dual path
          on /welcome so a parent who reached the empty-state
          dashboard (via ?welcome=skipped, or after leaving every
          team they were in) still sees the join-by-code entry
          point and doesn't have to hunt for it in the header menu. */}
      <p className="text-center text-xs text-ink-mute">
        Got a join code?{" "}
        <Link
          href="/join-team"
          className="font-medium text-brand-700 hover:text-brand-800"
        >
          Join a team
        </Link>
      </p>

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
