import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { ROLE_LABEL } from "@/lib/roles";
import type { Team, TeamRole } from "@/lib/types";

interface DashboardPageProps {
  searchParams: { welcome?: string };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  type MembershipRow = {
    role: TeamRole;
    teams: Pick<Team, "id" | "name"> | null;
  };

  const { data: memberships } = await supabase
    .from("team_memberships")
    .select("role, teams(id, name)")
    .eq("user_id", user.id)
    .returns<MembershipRow[]>();

  const teams = (memberships ?? []).flatMap((m) =>
    m.teams ? [{ ...m.teams, role: m.role }] : []
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
      <div>
        <h1 className="text-2xl font-bold text-ink">My teams</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Select a team to open its dashboard.
        </p>
      </div>

      {teams.length === 0 ? (
        <p className="rounded-lg border border-dashed border-hairline bg-surface-alt p-8 text-center text-sm text-ink-mute">
          You haven&apos;t created or joined any teams yet.
        </p>
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface shadow-card">
          {teams.map((team) => (
            <li key={team.id}>
              <Link
                href={`/teams/${team.id}`}
                className="flex items-center justify-between gap-3 px-5 py-4 transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
              >
                <span className="truncate font-medium text-ink">{team.name}</span>
                <Badge variant={team.role}>{ROLE_LABEL[team.role]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/teams/new"
        className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-warm shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-700"
      >
        <span aria-hidden className="text-base leading-none">+</span>
        Create a new team
      </Link>
    </div>
  );
}
