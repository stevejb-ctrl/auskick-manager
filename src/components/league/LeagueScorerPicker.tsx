"use client";

// ─── LeagueScorerPicker ──────────────────────────────────────
// Tiny bottom-sheet picker invoked by the scorebug's `+T` button.
// Lists on-field players so the coach can attribute the try
// without first having to tap the player tile. Sibling of AFL's
// `ScorerPickerSheet` pattern (inlined in LiveGame.tsx).

import { Guernsey } from "@/components/sf";
import type { Player } from "@/lib/types";

interface LeagueScorerPickerProps {
  /** On-field players, in display order. */
  onFieldPlayers: Player[];
  /** Picked → orchestrator records the try for this player. */
  onPick: (playerId: string) => void;
  onCancel: () => void;
  pending: boolean;
}

export function LeagueScorerPicker({
  onFieldPlayers,
  onPick,
  onCancel,
  pending,
}: LeagueScorerPickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-label="Who scored the try?"
        className="w-full max-w-md rounded-t-2xl bg-surface p-4 shadow-modal sm:rounded-2xl"
      >
        <header className="mb-2 flex items-start justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">
              Who scored?
            </h2>
            <p className="text-xs text-ink-mute">
              Pick the player who scored the try.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2 py-1 text-sm text-ink-mute hover:bg-surface-alt"
          >
            Cancel
          </button>
        </header>
        {onFieldPlayers.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-ink-mute">
            No players on the field.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {onFieldPlayers.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p.id)}
                  disabled={pending}
                  className="flex w-full items-center gap-3 px-2 py-2.5 text-left text-sm transition-colors hover:bg-surface-alt disabled:opacity-60"
                >
                  <Guernsey
                    num={p.jersey_number != null ? String(p.jersey_number) : ""}
                    size={28}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">
                    {p.full_name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
