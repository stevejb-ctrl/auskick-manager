import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateTeamForm } from "@/components/dashboard/CreateTeamForm";
import type { Team } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  type MembershipRow = {
    role: string;
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My teams</h1>
        <p className="mt-1 text-sm text-gray-500">
          Select a team to manage its squad.
        </p>
      </div>

      {teams.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          You haven&apos;t created or joined any teams yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
          {teams.map((team) => (
            <li key={team.id}>
              <Link
                href={`/teams/${team.id}/squad`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50"
              >
                <span className="font-medium text-gray-900">{team.name}</span>
                <span className="text-sm text-gray-400 capitalize">
                  {team.role.replace("_", " ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-800">
          Create a new team
        </h2>
        <CreateTeamForm userId={user.id} />
      </div>
    </div>
  );
}
