"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { addNote, deleteNote } from "@/app/(app)/admin/actions";
import type { ContactNote } from "@/lib/types";

interface NotesListProps {
  profileId: string;
  notes: ContactNote[];
}

export function NotesList({ profileId, notes }: NotesListProps) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await addNote(profileId, trimmed);
      if (!res.success) setError(res.error);
      else setBody("");
    });
  }

  function handleDelete(noteId: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteNote(noteId);
      if (!res.success) setError(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Add a note…"
          className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-mute tabular-nums">
            {body.length}/4000
          </span>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={body.trim().length === 0 || pending}
            loading={pending}
          >
            Add note
          </Button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      {notes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-hairline bg-surface-alt px-3 py-4 text-center text-xs text-ink-mute">
          No notes yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-md border border-hairline bg-surface p-3 shadow-card"
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-ink-mute">
                <FormattedDateTime iso={n.created_at} mode="short" />
                <button
                  type="button"
                  onClick={() => handleDelete(n.id)}
                  className="text-danger/80 hover:text-danger"
                  aria-label="Delete note"
                >
                  Delete
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
