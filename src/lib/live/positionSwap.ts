// ─── A position change, as the lineup sees it ────────────────
// On an AFL big field two kids trade named positions (position_swap).
// The lineup only knows lines (zones), so a change inside one line
// leaves it as it is, and one across lines (CHB ↔ C) moves the kids
// between lines exactly as a field_zone_swap does. The replays turn the
// event into that zone swap; the seat map reads the positions.
// Pure, and type-only imports, so fairness.ts can use it.

import type { GameEvent, Zone } from "@/lib/types";

const ZONES: readonly Zone[] = ["back", "hback", "mid", "hfwd", "fwd"];
const zoneOf = (v: unknown): Zone | null => (typeof v === "string" && (ZONES as readonly string[]).includes(v) ? (v as Zone) : null);

/** A position_swap's metadata, as recordPositionSwap writes it. */
export interface PositionSwapMeta {
  player_a_id: string;
  /** Null: player_a moved to an empty position. */
  player_b_id: string | null;
  position_a: string;
  position_b: string;
  zone_a: Zone;
  zone_b: Zone;
  quarter: number;
  elapsed_ms: number;
  /** Undo putting a change back. */
  undo?: boolean;
}

/**
 * The field_zone_swap a position change makes of the lineup: null when
 * both positions are on one line (nobody changes line), or the event
 * isn't a position_swap.
 */
export function positionSwapAsZoneSwap<E extends Pick<GameEvent, "type" | "metadata" | "player_id">>(ev: E): E | null {
  if (ev.type !== "position_swap") return null;
  const meta = (ev.metadata ?? {}) as Record<string, unknown>;
  const a = typeof meta.player_a_id === "string" ? meta.player_a_id : null;
  const b = typeof meta.player_b_id === "string" && meta.player_b_id ? meta.player_b_id : null;
  const zoneA = zoneOf(meta.zone_a);
  const zoneB = zoneOf(meta.zone_b);
  if (!a || !zoneA || !zoneB || zoneA === zoneB) return null;
  return {
    ...ev,
    type: "field_zone_swap",
    player_id: a,
    metadata: {
      player_a_id: a,
      zone_a: zoneA,
      ...(b ? { player_b_id: b } : {}),
      zone_b: zoneB,
      quarter: meta.quarter,
      elapsed_ms: meta.elapsed_ms,
    },
  };
}

/** The toast: "Jack S to FB · Tom to CHB · position change logged". */
export function positionSwapToast(a: { name: string; to: string }, b: { name: string; to: string } | null): string {
  return [`${a.name} to ${a.to}`, b ? `${b.name} to ${b.to}` : null, "position change logged"].filter(Boolean).join(" · ");
}
