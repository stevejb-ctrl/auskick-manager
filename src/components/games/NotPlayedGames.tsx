"use client";

// ─── NotPlayedGames ──────────────────────────────────────────
// Games well past their start that were never run (lib/games/notPlayed).
// Round 3 edge testing (24 Oct 2026): last Saturday's washed-out game
// stayed "Next up" forever, over the game that really was next. They
// live here instead, on Today, the Games list and the game's own page,
// with the two ways out: delete it, or mark it played (it happened
// without the app).

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markGamePlayed } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { DeleteGameDialog } from "@/components/games/DeleteGameDialog";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Eyebrow, SFButton, SFCard } from "@/components/sf";

interface NotPlayedGame {
  id: string;
  opponent: string;
  scheduled_at: string;
  round_number: number | null;
}

/** "Didn't play?" and its two buttons, for one game. */
export function NotPlayedActions({
  teamId,
  gameId,
  canEdit,
  afterDelete = "stay",
}: {
  teamId: string;
  gameId: string;
  /** Coaches (admins) only; anyone else just reads the line. */
  canEdit: boolean;
  /** "games": go to the Games list (the game's own page is gone). */
  afterDelete?: "stay" | "games";
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function markPlayed() {
    setError(null);
    startTransition(async () => {
      const res = await markGamePlayed(teamId, gameId);
      if (!res.success) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-dim">
        {canEdit ? "Didn't play? Delete it, or mark it played." : "This game wasn't run in Siren."}
      </p>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <SFButton size="sm" variant="ghost" onClick={markPlayed} loading={isPending}>
            Mark played
          </SFButton>
          <SFButton size="sm" variant="ghost" onClick={() => setDeleting(true)} disabled={isPending}>
            Delete
          </SFButton>
        </div>
      )}
      {error && <InlineAlert>{error}</InlineAlert>}
      {deleting && (
        <DeleteGameDialog
          teamId={teamId}
          gameId={gameId}
          onClose={() => setDeleting(false)}
          onDeleted={afterDelete === "stay" ? () => router.refresh() : undefined}
        />
      )}
    </div>
  );
}

export function NotPlayedGames({
  teamId,
  games,
  canEdit,
}: {
  teamId: string;
  games: NotPlayedGame[];
  canEdit: boolean;
}) {
  if (games.length === 0) return null;
  return (
    <section aria-label="Not played" data-testid="not-played">
      <SFCard>
        <Eyebrow>Not played</Eyebrow>
        <ul className="mt-2 divide-y divide-hairline">
          {games.map((g) => (
            <li key={g.id} className="space-y-2 py-3 first:pt-1 last:pb-0">
              <Link
                href={`/teams/${teamId}/games/${g.id}`}
                className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-semibold text-ink hover:underline"
              >
                <span className="min-w-0 break-words">
                  {g.round_number != null && `R${g.round_number} · `}vs {g.opponent}
                </span>
                <span className="text-xs font-normal text-ink-mute">
                  <FormattedDateTime iso={g.scheduled_at} mode="short" />
                </span>
              </Link>
              <NotPlayedActions teamId={teamId} gameId={g.id} canEdit={canEdit} />
            </li>
          ))}
        </ul>
      </SFCard>
    </section>
  );
}
