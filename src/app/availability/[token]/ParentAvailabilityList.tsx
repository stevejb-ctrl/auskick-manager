"use client";

import { AvailabilityRow } from "@/components/games/AvailabilityRow";
import { answerAvailability } from "./actions";
import type { AvailabilityStatus } from "@/lib/types";

export interface ParentKid {
  id: string;
  /** "Tyler H." (kidLabel): anyone with the link can open this page. */
  label: string;
  jerseyNumber: number | null;
  status: AvailabilityStatus;
  replied: boolean;
}

/**
 * The squad with an In / Out each: the team availability list's own
 * row, answering through the link's token instead of the team's write
 * queue.
 */
export function ParentAvailabilityList({
  token,
  gameId,
  kids,
}: {
  token: string;
  gameId: string;
  kids: ParentKid[];
}) {
  return (
    <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface shadow-card">
      {kids.map((kid) => (
        <AvailabilityRow
          key={kid.id}
          gameId={gameId}
          playerId={kid.id}
          playerName={kid.label}
          jerseyNumber={kid.jerseyNumber}
          status={kid.status}
          canEdit
          answering
          note={kid.replied ? "Answered" : undefined}
          onWrite={(next) => answerAvailability(token, kid.id, next)}
        />
      ))}
    </ul>
  );
}
