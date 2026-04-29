"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { TagChip, TAG_COLORS } from "@/components/admin/TagChip";
import { createTag, deleteTag, updateTag } from "@/app/(app)/admin/actions";
import type { ContactTag } from "@/lib/types";

interface TagManagerProps {
  initialTags: ContactTag[];
}

export function TagManager({ initialTags }: TagManagerProps) {
  const [tags, setTags] = useState(initialTags);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("brand");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>("brand");
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await createTag(trimmed, color);
      if (!res.success) {
        setError(res.error);
        return;
      }
      // Append the real row from the server. Earlier this used a fake
      // `temp-${Date.now()}` id and let revalidatePath swap it in
      // later — but `useState(initialTags)` doesn't sync to prop
      // changes, so the temp row stayed put. Editing then sent
      // "temp-1234…" to updateTag and Postgres rejected it with
      // "invalid input syntax for type uuid" — leaving the row stuck
      // in edit mode forever.
      const created = res.data;
      if (created) {
        setTags((prev) => [...prev, created]);
      }
      setName("");
      setColor("brand");
    });
  }

  function startEdit(tag: ContactTag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  function handleSaveEdit() {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (trimmed.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await updateTag(editingId, trimmed, editColor);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setTags((prev) =>
        prev.map((t) =>
          t.id === editingId ? { ...t, name: trimmed, color: editColor } : t
        )
      );
      setEditingId(null);
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this tag? It will be removed from everyone it's assigned to.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteTag(id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setTags((prev) => prev.filter((t) => t.id !== id));
    });
  }

  return (
    <div className="space-y-6">
      {/* Create */}
      <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">New tag</h3>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-micro text-ink-mute">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="mt-1 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-micro text-ink-mute">
              Colour
            </label>
            <ColorSelect value={color} onChange={setColor} />
          </div>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={name.trim().length === 0 || pending}
            loading={pending}
          >
            Add tag
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>

      {/* List */}
      <div className="space-y-2">
        {tags.length === 0 ? (
          <p className="rounded-lg border border-dashed border-hairline bg-surface-alt px-4 py-6 text-center text-sm text-ink-mute">
            No tags yet. Create one above.
          </p>
        ) : (
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
            {tags.map((t) => {
              const editing = editingId === t.id;
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  {editing ? (
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={40}
                        className="flex-1 rounded-md border border-hairline bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                      />
                      <ColorSelect value={editColor} onChange={setEditColor} />
                    </div>
                  ) : (
                    <TagChip name={t.name} color={t.color} />
                  )}
                  <div className="flex items-center gap-1">
                    {editing ? (
                      <>
                        <Button size="sm" onClick={handleSaveEdit} loading={pending}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(t)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(t.id)}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ColorSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
    >
      {TAG_COLORS.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
