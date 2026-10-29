"use client";

// ─── LeaguePlayerTile ────────────────────────────────────────
// Rugby's (league and union) player tile: the shared LinePlayerTile in
// rugby's words (UI polish round 2, Steve 23 Oct 2026). It was a pill
// token of its own ("Alicia B · #1 · 1:44"), the one live field not on
// the card tile AFL, soccer, basketball and touch share. Now the same
// 68px card: row 1 the line (FWD / BCK) or named position (HK) and
// #number with the state chips, row 2 the name, row 3 the time bar and
// time.
//
// Rugby's own chips ride in the tile's sport slot: the FR / DH vest
// badge and the kick badge (conversions, kickoffs). Tries are the score
// chip. The time bar is the opt-in F / C / B split ("centre" is time in
// a vest), shown only when the game tracks it.

import { memo } from "react";
import type { ChipKey, ChipMode } from "@/lib/chips";
import type { Player } from "@/lib/types";
import type { VestType } from "@/lib/sports/rugby_league/vests";
import type { PlayerConversionStatus } from "@/lib/sports/rugby_league/kicks";
import type { LeagueZoneMs } from "@/lib/sports/rugby_league/fairness";
import { LinePlayerTile, type TileLineStyle } from "@/components/live/LinePlayerTile";
import { PlayerVestBadge } from "./PlayerVestBadge";
import { PlayerKickBadge } from "./PlayerKickBadge";
import { ZONE_STRIP } from "@/components/live/zoneStrip";

/** Rugby's lines on a tile, and the vest as the bar's centre share. */
export const LEAGUE_TILE_STYLES: Record<"forwards" | "centre" | "backs", TileLineStyle> = {
  forwards: {
    short: "FWD",
    label: "Forwards",
    textClass: "text-zone-f",
    fillClass: "bg-zone-f-fill",
    stripClass: ZONE_STRIP.f,
  },
  centre: {
    short: "",
    label: "In a vest",
    textClass: "text-zone-c",
    fillClass: "bg-zone-c-fill",
    stripClass: ZONE_STRIP.c,
  },
  backs: {
    short: "BCK",
    label: "Backs",
    textClass: "text-zone-b",
    fillClass: "bg-zone-b-fill",
    stripClass: ZONE_STRIP.b,
  },
};
const LEAGUE_BAR_ORDER = ["forwards", "centre", "backs"] as const;

interface LeaguePlayerTileProps {
  player: Player;
  /** On the field or on the bench (the bench shows no line). */
  variant: "field" | "bench";
  /** The line the kid is in on the field. */
  line?: "forwards" | "backs" | null;
  selected?: boolean;
  /** Dim the tile when another tile is selected and this one isn't a swap target. */
  dimmed?: boolean;
  /** Tries credited to this player so far this game. */
  tries?: number;
  /** Total time on field this game (ms). */
  totalMs?: number;
  /** Currently-worn vest (FR / DH). */
  vest?: VestType | null;
  conversion?: PlayerConversionStatus | null;
  /** True when the player has taken at least one kickoff this game. */
  kickedOff?: boolean;
  injured?: boolean;
  /** Injured with reason "out": the kid went home (lib/live/wentHome). */
  wentHome?: boolean;
  loaned?: boolean;
  /**
   * Suggested rotation: "off" on a field tile, "on" on a bench tile,
   * with its pair number when more than one is pending.
   */
  swap?: {
    role: "off" | "on";
    pair: number;
    totalPairs: number;
  } | null;
  /** The sub card is in its SUB DUE state. */
  swapDue?: boolean;
  /** Legacy cohort chip modes (retired with How we play; ignored). */
  chipModes?: Partial<Record<ChipKey, ChipMode>>;
  /** This game's F / C / B time (the opt-in time bar). */
  zoneMs?: LeagueZoneMs;
  onClick?: () => void;
  /** Long-press handler — opens per-player action sheet. */
  onLongPress?: () => void;
  /** A mutation is pending: taps wait. */
  disabled?: boolean;
  /** Named positions: the kid's position, e.g. "HK". */
  positionLabel?: string | null;
  /** Season role "Plays every minute" (lineup screens). */
  keepOn?: boolean;
}

function LeaguePlayerTileImpl({
  player,
  variant,
  line = null,
  selected = false,
  dimmed = false,
  tries = 0,
  totalMs,
  vest = null,
  conversion = null,
  kickedOff = false,
  injured = false,
  wentHome = false,
  loaned = false,
  swap = null,
  swapDue = false,
  zoneMs,
  onClick,
  onLongPress,
  disabled = false,
  positionLabel = null,
  keepOn = false,
}: LeaguePlayerTileProps) {
  const chips =
    vest || conversion || kickedOff ? (
      <>
        {vest && <PlayerVestBadge vest={vest} dimmed={variant === "bench"} />}
        {(conversion || kickedOff) && (
          <PlayerKickBadge conversion={conversion} kickedOff={kickedOff} dimmed={variant === "bench"} />
        )}
      </>
    ) : null;
  return (
    <LinePlayerTile
      testId={`league-player-tile-${player.id}`}
      player={player}
      line={variant === "field" ? line : null}
      styles={LEAGUE_TILE_STYLES}
      barOrder={LEAGUE_BAR_ORDER}
      onClick={disabled ? undefined : onClick}
      onLongPress={disabled ? undefined : onLongPress}
      selected={selected}
      dimmed={dimmed}
      swap={swap ? { role: swap.role, pair: swap.pair, totalPairs: swap.totalPairs } : null}
      swapDue={swapDue}
      totalMs={totalMs}
      lineMs={zoneMs ? { forwards: zoneMs.forwards, centre: zoneMs.centre, backs: zoneMs.backs } : undefined}
      injured={injured}
      wentHome={wentHome}
      loaned={loaned}
      score={tries > 0 ? { text: `${tries}T`, label: `${tries} ${tries === 1 ? "try" : "tries"}` } : null}
      extraChip={chips}
      positionLabel={positionLabel}
      keepOn={keepOn}
    />
  );
}

export const LeaguePlayerTile = memo(LeaguePlayerTileImpl);
