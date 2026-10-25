import { Suspense } from "react";
import { AvailabilityList } from "@/components/games/AvailabilityList";
import { GameDayAvailability } from "@/components/games/GameDayAvailability";
import { MarkAllInButton } from "@/components/games/MarkAllInButton";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Spinner } from "@/components/ui/Spinner";
import type { LiveAuth } from "@/lib/types";
import { shortNames } from "@/lib/names";

interface GameDayAvailabilityPanelProps {
  auth: LiveAuth;
  teamId: string;
  gameId: string;
  /** Active squad (fill-ins excluded — they're always in). */
  squad: { id: string; full_name: string }[];
  /** Everyone currently in: availability rows, fill-ins, late arrivals. */
  availableIds: Iterable<string>;
  fillInCount: number;
  canManageMatch: boolean;
  showJerseyNumber: boolean;
}

/**
 * Server half of the game-day "Who's here" panel: works out the summary
 * and renders the shared AvailabilityList inside the collapsible card.
 * Same panel for every sport.
 *
 * A kid nobody has marked for this game (added to the squad after the
 * game was made, before new kids were marked In for games already made)
 * is "Not marked", not "Out", with a button to bring them in: they were
 * silently left out of the suggested lineup (UX round 2, 24 Oct 2026).
 */
export async function GameDayAvailabilityPanel({
  auth,
  teamId,
  gameId,
  squad,
  availableIds,
  fillInCount,
  canManageMatch,
  showJerseyNumber,
}: GameDayAvailabilityPanelProps) {
  const inSet = new Set(availableIds);
  const out = squad.filter((p) => !inSet.has(p.id));
  const total = squad.length + fillInCount;
  const inCount = total - out.length;
  // "Out: Mia C, Mia T" when two Mias are out (lib/names).
  const outNames = shortNames(squad);

  // Who has a row for this game at all. Only once some kids are marked
  // does an unmarked one stand out (a game nobody has marked yet opens
  // the list with "Mark all in").
  const db = auth.kind === "token" ? createAdminClient() : createClient();
  const { data: rows } = await db.from("game_availability").select("player_id").eq("game_id", gameId);
  const marked = new Set(((rows ?? []) as { player_id: string }[]).map((r) => r.player_id));
  const notMarked = marked.size > 0 ? out.filter((p) => !marked.has(p.id)) : [];
  const notMarkedIds = new Set(notMarked.map((p) => p.id));
  const notMarkedNames = notMarked.map((p) => outNames.get(p.id) ?? p.full_name);

  return (
    <GameDayAvailability
      inCount={inCount}
      total={total}
      outNames={out.filter((p) => !notMarkedIds.has(p.id)).map((p) => outNames.get(p.id) ?? p.full_name)}
      notMarkedNames={notMarkedNames}
      notice={
        notMarked.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-2.5 text-sm text-ink-dim">
            <span className="min-w-0 flex-1">
              {notMarkedNames.length === 1
                ? `${notMarkedNames[0]} isn't marked for this game yet.`
                : `${notMarkedNames.length} kids aren't marked for this game yet.`}
            </span>
            <MarkAllInButton
              auth={auth}
              gameId={gameId}
              notInIds={notMarked.map((p) => p.id)}
              label={notMarkedNames.length === 1 ? `Mark ${notMarkedNames[0]} in` : `Mark these ${notMarkedNames.length} in`}
            />
          </div>
        ) : undefined
      }
      defaultOpen={inCount === 0}
    >
      <Suspense
        fallback={
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        }
      >
        <AvailabilityList
          auth={auth}
          teamId={teamId}
          gameId={gameId}
          canMarkAvailability
          canManageMatch={canManageMatch}
          showJerseyNumber={showJerseyNumber}
        />
      </Suspense>
    </GameDayAvailability>
  );
}
