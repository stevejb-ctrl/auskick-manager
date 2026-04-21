import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/Badge";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { NotesList } from "@/components/admin/NotesList";
import { TagPicker } from "@/components/admin/TagPicker";
import { UnsubscribeToggle } from "@/components/admin/UnsubscribeToggle";
import { getUserDetail, listAllTags } from "@/lib/admin/queries";

interface PageProps {
  params: { profileId: string };
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  const admin = createAdminClient();
  const [detail, allTags] = await Promise.all([
    getUserDetail(admin, params.profileId),
    listAllTags(admin),
  ]);

  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          ← All users
        </Link>
      </div>

      {/* Identity card */}
      <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              {detail.profile.full_name || detail.profile.email}
            </h2>
            <p className="text-sm text-ink-dim">{detail.profile.email}</p>
            <p className="mt-1 text-xs text-ink-mute">
              Joined <FormattedDateTime iso={detail.profile.created_at} mode="short" />
            </p>
          </div>
          {detail.profile.is_super_admin && (
            <Badge variant="admin">Super admin</Badge>
          )}
        </div>
      </div>

      {/* Memberships */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-micro text-ink-dim">
          Teams &amp; roles
        </h3>
        {detail.memberships.length === 0 ? (
          <p className="rounded-lg border border-dashed border-hairline bg-surface-alt px-4 py-4 text-sm text-ink-mute">
            Not on any teams.
          </p>
        ) : (
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
            {detail.memberships.map((m) => (
              <li
                key={m.team_id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="text-sm font-medium text-ink">{m.team_name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={m.role}>{m.role.replace("_", " ")}</Badge>
                  <span className="text-xs text-ink-mute">
                    <FormattedDateTime iso={m.joined_at} mode="short" />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tags */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-micro text-ink-dim">
          Tags
        </h3>
        <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card">
          <TagPicker
            profileId={detail.profile.id}
            assigned={detail.tags}
            allTags={allTags}
          />
        </div>
      </section>

      {/* Notes */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-micro text-ink-dim">
          Notes
        </h3>
        <NotesList profileId={detail.profile.id} notes={detail.notes} />
      </section>

      {/* Preferences */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-micro text-ink-dim">
          Email preferences
        </h3>
        <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card">
          <UnsubscribeToggle
            profileId={detail.profile.id}
            initialUnsubscribed={detail.preference?.unsubscribed_at !== null && detail.preference !== null}
          />
        </div>
      </section>
    </div>
  );
}
