import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { KpiCard } from "@/components/admin/KpiCard";
import { DataTable, type Column } from "@/components/admin/DataTable";
import {
  getKPIs,
  getRecentSignups,
  getRecentTeams,
  getMostActiveTeams,
  getRecentCompletedGames,
  type ActiveTeamRow,
  type CompletedGameRow,
  type SignupRow,
  type TeamRow,
} from "@/lib/admin/queries";

export default async function AdminOverviewPage() {
  const admin = createAdminClient();

  const [kpis, signups, teams, active, completed] = await Promise.all([
    getKPIs(admin),
    getRecentSignups(admin, 20),
    getRecentTeams(admin, 10),
    getMostActiveTeams(admin, 30, 5),
    getRecentCompletedGames(admin, 10),
  ]);

  const signupCols: Column<SignupRow>[] = [
    {
      key: "email",
      header: "Email",
      render: (r) => <span className="font-medium text-ink">{r.email}</span>,
    },
    { key: "name", header: "Name", render: (r) => r.full_name ?? "—" },
    {
      key: "teams",
      header: "Teams",
      render: (r) => <span className="tabular-nums">{r.team_count}</span>,
    },
    {
      key: "joined",
      header: "Joined",
      render: (r) => <FormattedDateTime iso={r.created_at} mode="short" />,
    },
  ];

  const teamCols: Column<TeamRow>[] = [
    {
      key: "name",
      header: "Team",
      render: (r) => <span className="font-medium text-ink">{r.name}</span>,
    },
    { key: "age", header: "Age", render: (r) => r.age_group },
    { key: "admin", header: "Admin", render: (r) => r.admin_email ?? "—" },
    {
      key: "members",
      header: "Members",
      render: (r) => <span className="tabular-nums">{r.member_count}</span>,
    },
    {
      key: "players",
      header: "Players",
      render: (r) => <span className="tabular-nums">{r.player_count}</span>,
    },
    {
      key: "created",
      header: "Created",
      render: (r) => <FormattedDateTime iso={r.created_at} mode="short" />,
    },
  ];

  const activeCols: Column<ActiveTeamRow>[] = [
    {
      key: "team",
      header: "Team",
      render: (r) => <span className="font-medium text-ink">{r.name}</span>,
    },
    {
      key: "events",
      header: "Events (30d)",
      render: (r) => <span className="tabular-nums">{r.event_count}</span>,
    },
  ];

  const completedCols: Column<CompletedGameRow>[] = [
    {
      key: "team",
      header: "Team",
      render: (r) => <span className="font-medium text-ink">{r.team_name}</span>,
    },
    { key: "opp", header: "Opponent", render: (r) => r.opponent },
    {
      key: "when",
      header: "Played",
      render: (r) => <FormattedDateTime iso={r.scheduled_at} mode="short" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Users"
          value={kpis.users.total}
          sub={`+${kpis.users.new7d} last 7d · +${kpis.users.new30d} last 30d`}
        />
        <KpiCard
          label="Teams"
          value={kpis.teams.total}
          sub={`+${kpis.teams.new30d} last 30d`}
        />
        <KpiCard
          label="Games"
          value={kpis.games.total}
          sub={`${kpis.games.inProgress} live · ${kpis.games.completed7d} done 7d · ${kpis.games.upcoming7d} next 7d`}
        />
        <KpiCard label="Active players" value={kpis.players.activeTotal} />
      </div>

      <Section title="Recent signups" viewAllHref="/admin/users">
        <DataTable
          columns={signupCols}
          rows={signups}
          rowHref={(r) => `/admin/users/${r.id}`}
          empty="No signups yet."
        />
      </Section>

      <Section title="Recent teams" viewAllHref="/admin/teams">
        <DataTable columns={teamCols} rows={teams} empty="No teams yet." />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Most active teams (30d)">
          <DataTable
            columns={activeCols}
            rows={active}
            empty="No events in the last 30 days."
          />
        </Section>
        <Section title="Recent completed games" viewAllHref="/admin/games">
          <DataTable
            columns={completedCols}
            rows={completed}
            empty="No completed games yet."
          />
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  viewAllHref,
  children,
}: {
  title: string;
  viewAllHref?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-micro text-ink-dim">
          {title}
        </h2>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            View all →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
