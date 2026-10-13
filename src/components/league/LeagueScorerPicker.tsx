"use client";

// ─── LeagueScorerPicker ──────────────────────────────────────
// Tiny bottom-sheet picker invoked by the scorebug's `+T` button
// (and, U13+, `+PG` / `+FG` to name the kicker).
// Lists on-field players so the coach can attribute the try
// without first having to tap the player tile. Sibling of AFL's
// `ScorerPickerSheet` pattern (inlined in LiveGame.tsx).

import { Guernsey } from "@/components/sf";
import type { Player } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";

interface LeagueScorerPickerProps {
  /** On-field players, in display order. */
  onFieldPlayers: Player[];
  /** Picked → orchestrator records the try for this player. */
  onPick: (playerId: string) => void;
  onCancel: () => void;
  pending: boolean;
  /** What was scored. Defaults to a try. */
  score?: "try" | "penalty_goal" | "field_goal";
}

const COPY = {
  try: { label: "Who scored the try?", heading: "Who scored?", prompt: "Pick the player who scored the try." },
  penalty_goal: { label: "Who kicked the penalty goal?", heading: "Who kicked?", prompt: "Pick the player who kicked the penalty goal." },
  field_goal: { label: "Who kicked the field goal?", heading: "Who kicked?", prompt: "Pick the player who kicked the field goal." },
} as const;

export function LeagueScorerPicker({
  onFieldPlayers,
  onPick,
  onCancel,
  pending,
  score = "try",
}: LeagueScorerPickerProps) {
  const copy = COPY[score];
  return (
    <Modal size="md" placement="sheet" label={copy.label} onClose={onCancel} padding="p-4">
        <header className="mb-2 flex items-start justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">
              {copy.heading}
            </h2>
            <p className="text-xs text-ink-mute">
              {copy.prompt}
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
      </Modal>
  );
}
