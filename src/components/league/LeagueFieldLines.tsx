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
import { RUGBY_IN_GOAL_PX, RugbyMarks } from "./RugbyMarks";

export type LeagueLine = "forwards" | "backs";

/** From this many on, the field's tiles are the dense ones (league 13, union 15). */
export const LEAGUE_DENSE_FROM = 13;

interface LeagueFieldLinesProps {
  /** Which code's lines the field draws (RugbyMarks). */
  sport: RugbySport;
  /** The forwards at each size, where the sport states its split (union). */
  forwardsBySize?: Record<number, number>;
  forwardPlayers: Player[];
  backPlayers: Player[];
  /** The game's size: the spots drawn (a short side shows empty ones). */
  onFieldSize: number;
  vestRequirements?: { fr: boolean; dh: boolean };
  vestByPlayer: Record<string, VestType>;
  /** Named positions: playerId → its label ("HK2"). */
  positionLabels?: Record<string, string>;
  positionOrder?: Record<LeagueLine, string[]>;
  /** A kid in their spot (a KidTile). */
  kid: (player: Player, line: LeagueLine) => ReactNode;
  /** An empty spot (a KidSlot). */
  empty: (line: LeagueLine) => ReactNode;
  wakeUpKey?: number | null;
}

export function LeagueFieldLines({
  sport,
  forwardsBySize,
  forwardPlayers,
  backPlayers,
  onFieldSize,
  vestRequirements,
  vestByPlayer,
  positionLabels,
  positionOrder,
  kid,
  empty,
  wakeUpKey = null,
}: LeagueFieldLinesProps) {
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
  const lineOf = (slot: FieldSlot, player: Player | null): LeagueLine => {
    if (player && forwardIds.has(player.id)) return "forwards";
    if (player && backIds.has(player.id)) return "backs";
    return slot.role === "forward" || slot.role === "dh" ? "forwards" : "backs";
  };
  const dense = size >= LEAGUE_DENSE_FROM;

  // Each spot with its line and where it's drawn (0–1), for formationRows.
  const spots = arrangement.map((e) => ({ ...e, line: lineOf(e.slot, e.player), x: e.slot.x / 100, y: e.slot.y / 100 }));
  const byLine = formationRows(spots);
  let widest = 1;
  const lines: FieldLine[] = (["forwards", "backs"] as const).flatMap((line) => {
    const formation = byLine.find((l) => l.line === line);
    if (!formation) return [];
    const rows = formation.rows.map((row) =>
      row.map((s) => (
        <div key={s.slot.id} className="min-w-0">
          {s.player ? kid(s.player, line) : empty(line)}
        </div>
      )),
    );
    widest = Math.max(widest, ...rows.map((r) => r.length));
    const on = formation.rows.flat().filter((s) => s.player).length;
    const spotsInLine = formation.rows.flat().length;
    return [
      {
        key: line,
        label: line === "forwards" ? "Forwards" : "Backs",
        tiles: rows.flat(),
        rows,
        count: { text: `${on}/${spotsInLine}`, short: on < spotsInLine },
      },
    ];
  });

  return (
    // The pitch, named as the old field was (specs and screen readers
    // find the kids on it by it).
    <section aria-label="On field" className="flex min-h-full flex-1 flex-col">
      <FieldLines
        lines={lines}
        surface="field"
        dense={dense}
        tileWidth={widest >= 4 ? 88 : 112}
        wakeUpKey={wakeUpKey}
        marks={<RugbyMarks sport={sport} />}
        // The in-goals and posts stay clear of the kids, plus a little air.
        endsPx={RUGBY_IN_GOAL_PX + 6}
      />
    </section>
  );
}
