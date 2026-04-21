import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Pagination } from "@/components/admin/Pagination";
import { listGames, type GameListRow } from "@/lib/admin/queries";
import type { GameStatus } from "@/lib/types";

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: { status?: string; cursor?: string };
}

const STATUS_FILTERS: Array<{ value: GameStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

export default async function AdminGamesPage({ searchParams }: PageProps) {
  const admin = createAdminClient();
  const cursor = Math.max(0, parseInt(searchParams.cursor ?? "0", 10) || 0);

  const status: GameStatus | "all" =
    searchParams.status === "upcoming" ||
    searchParams.status === "in_progress" ||
    searchParams.status === "completed"
      ? searchParams.status
      : "all";

  const page = await listGames(admin, { status, cursor });

  const cols: Column<GameListRow>[] = [
    {
      key: "team",
      header: "Team",
      render: (r) => <span className="font-medium text-ink">{r.team_name}</span>,
    },
    { key: "opp", header: "Opponent", render: (r) => r.opponent },
    {
      key: "round",
      header: "Round",
      render: (r) => (r.round_number !== null ? `R${r.round_number}` : "—"),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
            r.status === "in_progress"
              ? "bg-warn-soft text-warn"
              : r.status === "completed"
                ? "bg-ok/10 text-ok"
                : "bg-surface-alt text-ink-dim"
          }`}
        >
          {r.status.replace("_", " ")}
        </span>
      ),
    },
    {
      key: "when",
      header: "When",
      render: (r) => <FormattedDateTime iso={r.scheduled_at} mode="short" />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const active = status === f.value;
          const href = f.value === "all" ? "/admin/games" : `/admin/games?status=${f.value}`;
          return (
            <Link
              key={f.value}
              href={href}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors duration-fast ${
                active
                  ? "bg-brand-600 text-warm"
                  : "bg-surface-alt text-ink-dim hover:text-ink"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>
      <DataTable
        columns={cols}
        rows={page.rows}
        rowHref={(r) => `/teams/${r.team_id}/games/${r.id}`}
        empty="No games in this view."
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
