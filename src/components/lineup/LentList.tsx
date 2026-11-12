"use client";

// ─── LentList ────────────────────────────────────────────────
// Kids lent to the other team, each with a plain Bring back. The period
// break drew it first (Stagehand round 9: four coaches didn't find the ×
// in Game settings); the pre-game pickers drew their own amber chip
// strip, a different look in each sport. One list now, at the break and
// before kickoff, in every sport.

import { SFButton } from "@/components/sf";

export interface LentListProps {
  players: { id: string; name: string }[];
  onBringBack: (playerId: string) => void;
  /** What Bring back does ("Bring them back and they join the bench for Q3."). */
  note: string;
  pending?: boolean;
  testId?: string;
  /** Each button's test id. */
  buttonTestId?: (playerId: string) => string;
  /** An error from the last write, under the list. */
  error?: string | null;
}

export function LentList({ players, onBringBack, note, pending = false, testId, buttonTestId, error }: LentListProps) {
  if (players.length === 0) return null;
  return (
    <section
      data-testid={testId}
      aria-label="Lent to the other team"
      className="rounded-md border border-hairline bg-surface px-4 py-3 shadow-card"
    >
      <p className="text-sm font-bold text-ink">Lent to the other team</p>
      <p className="mt-0.5 text-xs text-ink-dim">{note}</p>
      <ul className="mt-2 space-y-1.5">
        {players.map((p) => (
          <li key={p.id} className="flex min-h-[44px] items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-ink">{p.name}</span>
            <SFButton
              variant="subtle"
              size="sm"
              data-testid={buttonTestId?.(p.id)}
              // Its words first, then whose (label in name).
              aria-label={`Bring back ${p.name}`}
              disabled={pending}
              onClick={() => onBringBack(p.id)}
              className="min-h-[44px] shrink-0"
            >
              Bring back
            </SFButton>
          </li>
        ))}
      </ul>
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
