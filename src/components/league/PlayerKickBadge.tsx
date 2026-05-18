"use client";

// ─── PlayerKickBadge ─────────────────────────────────────────
// Two tiny chips that overlay a `LeaguePlayerTile` to show kick
// rotation status:
//
//   * Conversion boot — surfaces when the player has attempted a
//     conversion in the CURRENT cycle. Ring colour distinguishes
//     made (brand-tinted) from missed (ink-mute). A small `!`
//     overlay flags entries with `force: true`. A trailing `×N`
//     shows up if a player has multiple cycle attempts (rare —
//     only happens via force).
//
//   * Kickoff "K" chip — surfaces when the player has taken at
//     least one kickoff this game. Doesn't reset within the game
//     (kickoff rotation cycles through the whole squad), so this
//     is a stable "has had a turn" marker.
//
// Both badges are read-only; the dialogs (RecordConversionDialog,
// KickoffPicker) own the state changes.

import type { PlayerConversionStatus } from "@/lib/sports/rugby_league/kicks";

interface PlayerKickBadgeProps {
  /** Conversion-cycle status for this player, if any. Undefined / 0 attempts hides the boot. */
  conversion?: PlayerConversionStatus | null;
  /** True when the player has taken at least one kickoff this game. */
  kickedOff?: boolean;
  /** Whether the parent tile is dimmed (bench). Cascades to the badge opacity. */
  dimmed?: boolean;
}

export function PlayerKickBadge({
  conversion,
  kickedOff,
  dimmed = false,
}: PlayerKickBadgeProps) {
  const showBoot = conversion && conversion.attemptsInCycle > 0;
  if (!showBoot && !kickedOff) return null;

  return (
    <span className={["inline-flex items-center gap-1", dimmed ? "opacity-60" : ""].join(" ").trim()}>
      {showBoot && (
        <span
          aria-label={
            conversion.madeInCycle === conversion.attemptsInCycle
              ? `Made ${conversion.attemptsInCycle} of ${conversion.attemptsInCycle} conversions in this cycle`
              : `Made ${conversion.madeInCycle} of ${conversion.attemptsInCycle} conversions in this cycle`
          }
          className={[
            "relative inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ring-1",
            conversion.madeInCycle > 0
              ? "bg-brand-600/15 text-brand-600 ring-brand-600/40"
              : "bg-ink-mute/15 text-ink-mute ring-ink-mute/30",
          ].join(" ")}
          title={
            conversion.hasForceInCycle
              ? "Forced attempt — rotation override"
              : `Cycle: ${conversion.madeInCycle}/${conversion.attemptsInCycle} made`
          }
        >
          👟
          {conversion.attemptsInCycle > 1 && (
            <span className="ml-0.5 font-mono">×{conversion.attemptsInCycle}</span>
          )}
          {conversion.hasForceInCycle && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full bg-warn text-[8px] font-bold text-warm"
            >
              !
            </span>
          )}
        </span>
      )}
      {kickedOff && (
        <span
          aria-label="Has taken a kickoff this game"
          title="Has taken a kickoff this game"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-600 ring-1 ring-brand-600/30"
        >
          K
        </span>
      )}
    </span>
  );
}
