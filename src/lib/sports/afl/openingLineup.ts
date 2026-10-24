// ─── AFL's opening lineup ────────────────────────────────────
// The suggested lineup AFL's pre-kickoff lineup screen opens on, for
// every screen that shows it: the lineup screen itself and the game
// page's Game plan. The two used to differ, so the night-before text
// shared a different Q1 from the lineup the coach then started (UX round
// 2, 24 Oct 2026). Holds from the long-press menu ride along: Keep on
// field as keep-on, Keep in {line} pinned to the line. Pure.

import { suggestStartingLineup, type PlayerZoneMinutes } from "@/lib/fairness";
import { zoneCapsFor } from "@/lib/ageGroups";
import type { ChipMode } from "@/lib/chips";
import type { PlayerLock } from "@/lib/live/locks";
import type { AflPlaybookInput } from "@/lib/sports/afl/engine";
import type { Lineup, Player, PositionModel, Zone } from "@/lib/types";

export interface AflOpeningLineupInput {
  /** The kids who'll play (here, not lent), in the lineup screen's order. */
  players: Player[];
  /** Season time per kid per zone, in minutes. */
  season: PlayerZoneMinutes;
  onFieldSize: number;
  positionModel: PositionModel;
  /** Holds from the long-press menu (this game's player_lock events). */
  locks: Record<string, PlayerLock>;
  chipModeByKey?: Partial<Record<"a" | "b" | "c", ChipMode>>;
  /** The game's period length, for season balance's thresholds. */
  fullPeriodMs: number;
  aflPlaybook?: AflPlaybookInput;
}

export function aflOpeningLineup(input: AflOpeningLineupInput): Lineup {
  // Cohort chips retired with How we play (UX plan 5.8): their intent now lives in roles and rules.
  const chipByPlayerId: Record<string, "a" | "b" | "c" | null | undefined> = {};
  const pinned: Record<string, Zone> = {};
  let playbook = input.aflPlaybook;
  for (const [pid, hold] of Object.entries(input.locks)) {
    if (hold.kind === "zone") pinned[pid] = hold.zone as Zone;
    if (hold.kind === "field" && playbook) {
      const role = playbook.roles[pid] ?? { home: null, also: [], never: [], keepOn: false };
      playbook = { ...playbook, roles: { ...playbook.roles, [pid]: { ...role, keepOn: true } } };
    }
  }
  return suggestStartingLineup(
    input.players,
    input.season,
    0,
    zoneCapsFor(input.onFieldSize, input.positionModel),
    {},
    pinned,
    {},
    {},
    {},
    chipByPlayerId,
    input.chipModeByKey ?? {},
    input.fullPeriodMs,
    playbook,
  );
}
