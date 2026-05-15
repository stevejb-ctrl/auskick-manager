"use client";

// ─── LiveAdminUtilityRow ─────────────────────────────────────
// Shared "admin / utility action" row rendered near the bottom of
// the in-play view on both AFL `LiveGame.tsx` and netball
// `NetballLiveGame.tsx`. Puts the two related housekeeping
// affordances — "+ Add late arrival" and "Restart game" — onto a
// single strip of scrolling space instead of claiming two separate
// rows (Steve 2026-05-13).
//
// Render rules (preserved from the duplicated inline IIFE both
// files used to host):
//   - Row hides entirely when there's nothing to show (no
//     late-arrival candidates AND user isn't admin).
//   - LateArrivalMenu self-hides when its `candidates` list is
//     empty; we still gate the row mount on candidates.length to
//     skip the row chrome when only the LateArrival affordance
//     would be relevant but has nothing left to surface.
//   - ResetGameButton is admin-gated by the caller via `isAdmin`.
//
// The "+G/+B" record-score floating dock (z-40) and sticky-bottom
// scorebug (z-30) overlay this row when active, so it stays
// comfortably above them in scroll order.
//
// Steve 2026-05-15: Phase 5b of the LiveGameShell extraction. Two
// identical inline IIFE blocks in two files collapse to one
// source of truth; future tweaks (e.g. icon copy, padding) now
// land in one place.

import { LateArrivalMenu } from "@/components/live/LateArrivalMenu";
import { ResetGameButton } from "@/components/games/ResetGameButton";
import type { LiveAuth, Player } from "@/lib/types";

interface LiveAdminUtilityRowProps {
  /** Squad players eligible to add late (already filtered by caller — neither in field nor bench). */
  candidates: Player[];
  /** Called when the coach picks a late-arrival from the menu. */
  onLateArrival: (playerId: string) => void;
  /** Server-write-in-flight gate for the LateArrivalMenu spinner. */
  lateArrivalPending?: boolean;
  /** Auth context threaded to ResetGameButton. */
  auth: LiveAuth;
  /** Game id threaded to ResetGameButton. */
  gameId: string;
  /** True when the user has admin rights (renders the destructive reset button). */
  isAdmin?: boolean;
}

export function LiveAdminUtilityRow({
  candidates,
  onLateArrival,
  lateArrivalPending = false,
  auth,
  gameId,
  isAdmin = false,
}: LiveAdminUtilityRowProps) {
  const showLate = candidates.length > 0;
  if (!showLate && !isAdmin) return null;
  return (
    <div className="flex items-center justify-center gap-3 border-t border-hairline pt-4">
      {showLate && (
        <LateArrivalMenu
          candidates={candidates}
          onAdd={onLateArrival}
          pending={lateArrivalPending}
        />
      )}
      {isAdmin && <ResetGameButton auth={auth} gameId={gameId} />}
    </div>
  );
}
