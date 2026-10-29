"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [clearing, startClear] = useTransition();
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  // Each clear remounts the row, dropping its last tap; a new answer doesn't.
  const [clears, setClears] = useState<Record<string, number>>({});
  // A wrong kid's answer can be taken back to none (Stagehand round 8:
  // a sleepy parent could only overwrite another child's with Out).
  const clear = (id: string) =>
    startClear(async () => {
      const res = await answerAvailability(token, id, "unknown");
      if (res.success) {
        setCleared((prev) => new Set(prev).add(id));
        setClears((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
        router.refresh();
      }
    });
  return (
    <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface shadow-card">
      {kids.map((kid) => {
        // Cleared here: no answer, until a new tap answers again.
        const isCleared = cleared.has(kid.id);
        const answered = kid.replied && !isCleared;
        return (
          <li key={kid.id} className="list-none">
            <ul>
              <AvailabilityRow
                key={`${kid.id}-${clears[kid.id] ?? 0}`}
                gameId={gameId}
                playerId={kid.id}
                playerName={kid.label}
                jerseyNumber={kid.jerseyNumber}
                status={isCleared ? "unknown" : kid.status}
                canEdit
                answering
                note={answered ? "Answered · the coach can see it" : undefined}
                onWrite={(next) => {
                  setCleared((prev) => {
                    const s = new Set(prev);
                    s.delete(kid.id);
                    return s;
                  });
                  return answerAvailability(token, kid.id, next);
                }}
              />
            </ul>
            {answered && (
              <button
                type="button"
                disabled={clearing}
                onClick={() => clear(kid.id)}
                className="-mt-2 mb-1 ml-4 min-h-[36px] text-xs font-semibold text-ink-dim underline underline-offset-2 hover:text-ink"
                aria-label={`Clear the answer for ${kid.label}`}
              >
                Not my child? Clear
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
