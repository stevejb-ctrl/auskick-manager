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

import type { ReactNode } from "react";
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
  /**
   * Optional extra action(s) rendered in the same row alongside
   * Late-arrival + Reset. Composed by the caller so sport-specific
   * affordances don't have to be plumbed through this shared shell.
   * Steve 2026-05-20: AFL passes `<LiveGameSettingsButton>`,
   * rugby league passes `<LeagueGameSettingsButton>`; netball
   * passes nothing (no sub-interval concept).
   *
   * When `extra` is the ONLY thing renderable (no late candidates,
   * not admin), the row still mounts so the extra slot can surface.
   */
  extra?: ReactNode;
}

export function LiveAdminUtilityRow({
  candidates,
  onLateArrival,
  lateArrivalPending = false,
  auth,
  gameId,
  isAdmin = false,
  extra,
}: LiveAdminUtilityRowProps) {
  const showLate = candidates.length > 0;
  // Row mounts whenever ANY slot has content — extra now joins
  // late-candidates and isAdmin in the "is there anything to show"
  // gate so the Game-settings button (AFL or RL) surfaces even on
  // a non-admin / no-late-arrivals render.
  if (!showLate && !isAdmin && !extra) return null;
  return (
    <div className="flex items-center justify-center gap-3 border-t border-hairline pt-4">
      {showLate && (
        <LateArrivalMenu
          candidates={candidates}
          onAdd={onLateArrival}
          pending={lateArrivalPending}
        />
      )}
      {extra}
      {isAdmin && <ResetGameButton auth={auth} gameId={gameId} />}
    </div>
  );
}
