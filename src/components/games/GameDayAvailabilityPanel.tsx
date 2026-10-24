import { Suspense } from "react";
import { AvailabilityList } from "@/components/games/AvailabilityList";
import { GameDayAvailability } from "@/components/games/GameDayAvailability";
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
 * Same panel for AFL, netball and rugby league.
 */
export function GameDayAvailabilityPanel({
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

  return (
    <GameDayAvailability
      inCount={inCount}
      total={total}
      outNames={out.map((p) => outNames.get(p.id) ?? p.full_name)}
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
