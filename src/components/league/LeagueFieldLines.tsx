"use client";

// ─── LeagueFieldLines ────────────────────────────────────────
// Rugby's live field on live v3 (Phase 8): the shared FieldLines, two
// lines (Forwards over Backs), each kid a KidTile. Who stands where is
// still arrangeLeagueField's: FR / DH vest wearers in their vest's spot,
// the last back at fullback, union's named positions in their spots.
// The spots' rows (formationRows) are the line's rows, so union's 15 read
// as its pack and backline, and a big side gets the dense tile.
//
// The old count chip ("11/11") is the line's dim margin label now
// ("FORWARDS 6/6"), underlined when the line is short of its spots.

import type { ReactNode } from "react";
import type { Player } from "@/lib/types";
import type { VestType } from "@/lib/sports/rugby_league/vests";
import { arrangeLeagueField, type FieldSlot } from "@/lib/sports/rugby_league/fieldFormation";
import { formationRows } from "@/lib/live/formationRows";
import { FieldLines, type FieldLine } from "@/components/live/FieldLines";
import type { RugbySport } from "@/lib/sports/registry";
import { rugbyField } from "./RugbyMarks";

export type LeagueLine = "forwards" | "backs";

/** From this many on, the field's tiles are the dense ones (league 13, union 15). */
export const LEAGUE_DENSE_FROM = 13;

interface LeagueFieldLinesProps extends LeagueFieldInput<Player> {
  /** Which code's lines the field draws (RugbyMarks). */
  sport: RugbySport;
  /** A kid in their spot (a KidTile). */
  kid: (player: Player, line: LeagueLine) => ReactNode;
  /** An empty spot (a KidSlot). */
  empty: (line: LeagueLine) => ReactNode;
  wakeUpKey?: number | null;
}

/** Who stands where, for leagueFieldLayout. */
export interface LeagueFieldInput<T extends { id: string }> {
  /** The forwards at each size, where the sport states its split (union). */
  forwardsBySize?: Record<number, number>;
  forwardPlayers: T[];
  backPlayers: T[];
  /** The game's size: the spots drawn (a short side shows empty ones). */
  onFieldSize: number;
  vestRequirements?: { fr: boolean; dh: boolean };
  vestByPlayer: Record<string, VestType>;
  /** Named positions: playerId → its label ("HK2"). */
  positionLabels?: Record<string, string>;
  positionOrder?: Record<LeagueLine, string[]>;
}

export interface LeagueFieldLayout<T> {
  /** Forwards then backs, each its rows of spots (a kid, or null for an empty spot). */
  lines: { line: LeagueLine; rows: { key: string; player: T | null }[][] }[];
  /** A big side: the dense tiles. */
  dense: boolean;
  /** The tile width for the widest row. */
  tileWidth: number;
}

/**
 * Rugby's formation, line by line: arrangeLeagueField's spots (vest
 * wearers in their vest's spot, the last back at fullback, union's named
 * positions in theirs) as formationRows. The live field and the period
 * break both draw it, so the break's rows are the game's.
 */
export function leagueFieldLayout<T extends { id: string }>({
  forwardsBySize,
  forwardPlayers,
  backPlayers,
  onFieldSize,
  vestRequirements,
  vestByPlayer,
  positionLabels,
  positionOrder,
}: LeagueFieldInput<T>): LeagueFieldLayout<T> {
  const players = [...forwardPlayers, ...backPlayers];
  // Never fewer spots than kids: a side over the size still shows them all.
  const size = Math.max(onFieldSize, players.length);
  const arrangement = arrangeLeagueField({
    size,
    forwardsBySize,
    vestRequirements,
    players,
    forwardPlayers,
    backPlayers,
    vestByPlayer,
    positionLabels,
    positionOrder,
  });
  const forwardIds = new Set(forwardPlayers.map((p) => p.id));
  const backIds = new Set(backPlayers.map((p) => p.id));
  const lineOf = (slot: FieldSlot, player: T | null): LeagueLine => {
    if (player && forwardIds.has(player.id)) return "forwards";
    if (player && backIds.has(player.id)) return "backs";
    return slot.role === "forward" || slot.role === "dh" ? "forwards" : "backs";
  };

  // Each spot with its line and where it's drawn (0–1), for formationRows.
  const spots = arrangement.map((e) => ({ ...e, line: lineOf(e.slot, e.player), x: e.slot.x / 100, y: e.slot.y / 100 }));
  const byLine = formationRows(spots);
  const lines = (["forwards", "backs"] as const).flatMap((line) => {
    const formation = byLine.find((l) => l.line === line);
    if (!formation) return [];
    return [{ line, rows: formation.rows.map((row) => row.map((s) => ({ key: s.slot.id, player: s.player }))) }];
  });
  const widest = Math.max(1, ...lines.flatMap((l) => l.rows.map((r) => r.length)));
  return { lines, dense: size >= LEAGUE_DENSE_FROM, tileWidth: widest >= 4 ? 88 : 112 };
}

export function LeagueFieldLines({
  sport,
  kid,
  empty,
  wakeUpKey = null,
  ...input
}: LeagueFieldLinesProps) {
  const layout = leagueFieldLayout(input);
  const lines: FieldLine[] = layout.lines.map(({ line, rows: spots }) => {
    const rows = spots.map((row) =>
      row.map((s) => (
        <div key={s.key} className="min-w-0">
          {s.player ? kid(s.player, line) : empty(line)}
        </div>
      )),
    );
    const on = spots.flat().filter((s) => s.player).length;
    const spotsInLine = spots.flat().length;
    return {
      key: line,
      label: line === "forwards" ? "Forwards" : "Backs",
      tiles: rows.flat(),
      rows,
      count: { text: `${on}/${spotsInLine}`, short: on < spotsInLine },
    };
  });

  return (
    // The pitch, named as the old field was (specs and screen readers
    // find the kids on it by it).
    <section aria-label="On field" className="flex min-h-full flex-1 flex-col">
      <FieldLines
        lines={lines}
        {...rugbyField(sport, { dense: layout.dense, tileWidth: layout.tileWidth })}
        wakeUpKey={wakeUpKey}
      />
    </section>
  );
}
