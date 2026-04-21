"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { TagChip } from "@/components/admin/TagChip";
import { addTagToProfile, removeTagFromProfile } from "@/app/(app)/admin/actions";
import type { ContactTag } from "@/lib/types";

interface TagPickerProps {
  profileId: string;
  /** Tags currently attached to this profile. */
  assigned: ContactTag[];
  /** All tags in the system — used to populate the "add" dropdown. */
  allTags: ContactTag[];
}

export function TagPicker({ profileId, assigned, allTags }: TagPickerProps) {
  const [picker, setPicker] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const assignedIds = new Set(assigned.map((t) => t.id));
  const available = allTags.filter((t) => !assignedIds.has(t.id));

  function handleAdd() {
    if (!picker) return;
    setError(null);
    startTransition(async () => {
      const res = await addTagToProfile(profileId, picker);
      if (!res.success) setError(res.error);
      else setPicker("");
    });
  }

  function handleRemove(tagId: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeTagFromProfile(profileId, tagId);
      if (!res.success) setError(res.error);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {assigned.length === 0 && (
          <span className="text-xs text-ink-mute">No tags yet.</span>
        )}
        {assigned.map((t) => (
          <TagChip
            key={t.id}
            name={t.name}
            color={t.color}
            onRemove={() => handleRemove(t.id)}
          />
        ))}
      </div>
      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={picker}
            onChange={(e) => setPicker(e.target.value)}
            className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <option value="">Add tag…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleAdd}
            disabled={!picker || pending}
            loading={pending}
          >
            Add
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
