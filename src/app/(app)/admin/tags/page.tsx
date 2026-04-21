import { createAdminClient } from "@/lib/supabase/admin";
import { TagManager } from "@/components/admin/TagManager";
import { listAllTags } from "@/lib/admin/queries";

export default async function AdminTagsPage() {
  const admin = createAdminClient();
  const tags = await listAllTags(admin);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-dim">
        Tags are labels you can attach to user profiles. They drive filters on
        the Users tab and will drive email segments once broadcasts ship.
      </p>
      <TagManager initialTags={tags} />
    </div>
  );
}
