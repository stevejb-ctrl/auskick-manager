import { createAdminClient } from "@/lib/supabase/admin";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Pagination } from "@/components/admin/Pagination";
import { TagChip } from "@/components/admin/TagChip";
import { UsersFilterBar } from "@/components/admin/UsersFilterBar";
import {
  listAllTags,
  listUsers,
  type UserListRow,
} from "@/lib/admin/queries";

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: {
    q?: string;
    tags?: string;
    signup?: string;
    cursor?: string;
  };
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const admin = createAdminClient();
  const cursor = Math.max(0, parseInt(searchParams.cursor ?? "0", 10) || 0);
  const signupRange =
    searchParams.signup === "7d" ||
    searchParams.signup === "30d" ||
    searchParams.signup === "90d"
      ? searchParams.signup
      : "all";

  const tagIds = (searchParams.tags ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [page, allTags] = await Promise.all([
    listUsers(admin, {
      q: searchParams.q,
      signupRange,
      tagIds: tagIds.length ? tagIds : undefined,
      cursor,
    }),
    listAllTags(admin),
  ]);

  const cols: Column<UserListRow>[] = [
    {
      key: "email",
      header: "Email",
      render: (r) => (
        <span className="font-medium text-ink">
          {r.email}
          {r.unsubscribed && (
            <span className="ml-2 rounded-full bg-surface-alt px-1.5 py-0.5 text-[10px] uppercase tracking-micro text-ink-mute">
              unsubbed
            </span>
          )}
        </span>
      ),
    },
    { key: "name", header: "Name", render: (r) => r.full_name ?? "—" },
    {
      key: "teams",
      header: "Teams",
      render: (r) => <span className="tabular-nums">{r.team_count}</span>,
    },
    {
      key: "tags",
      header: "Tags",
      render: (r) =>
        r.tags.length === 0 ? (
          <span className="text-ink-mute">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {r.tags.map((t) => (
              <TagChip key={t.id} name={t.name} color={t.color} />
            ))}
          </div>
        ),
    },
    {
      key: "joined",
      header: "Joined",
      render: (r) => <FormattedDateTime iso={r.created_at} mode="short" />,
    },
  ];

  return (
    <div className="space-y-4">
      <UsersFilterBar tags={allTags} />
      <DataTable
        columns={cols}
        rows={page.rows}
        rowHref={(r) => `/admin/users/${r.id}`}
        empty="No users match these filters."
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
