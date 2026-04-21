import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Pagination } from "@/components/admin/Pagination";
import { listTeams, type TeamRow } from "@/lib/admin/queries";

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: { q?: string; cursor?: string };
}

export default async function AdminTeamsPage({ searchParams }: PageProps) {
  const admin = createAdminClient();
  const cursor = Math.max(0, parseInt(searchParams.cursor ?? "0", 10) || 0);
  const page = await listTeams(admin, { q: searchParams.q, cursor });

  const cols: Column<TeamRow>[] = [
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

  return (
    <div className="space-y-4">
      <SearchBar initial={searchParams.q ?? ""} />
      <DataTable
        columns={cols}
        rows={page.rows}
        rowHref={(r) => `/teams/${r.id}`}
        empty="No teams match this search."
      />
      <Pagination
        cursor={cursor}
        nextCursor={page.nextCursor}
        pageSize={PAGE_SIZE}
        total={page.total}
      />
    </div>
  );
}

function SearchBar({ initial }: { initial: string }) {
  // Simple server-rendered form. No state; submit re-renders the page.
  return (
    <form action="/admin/teams" method="get" className="flex items-center gap-2">
      <input
        name="q"
        defaultValue={initial}
        placeholder="Search team name…"
        className="min-w-[220px] flex-1 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      />
      <button
        type="submit"
        className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-ink-dim hover:bg-surface-alt"
      >
        Search
      </button>
      {initial && (
        <Link
          href="/admin/teams"
          className="text-xs text-ink-mute hover:text-ink-dim"
        >
          Clear
        </Link>
      )}
    </form>
  );
}
