"use client";

// ─── PickerField ─────────────────────────────────────────────
// The pre-game lineup picker's field, in live v3's look (Steve, 10 Nov
// 2026: "the lineup picker in AFL still uses the old design … ensure all
// sports are all on the same design"). The picker is the period break's
// job before kickoff, so it's drawn the same way: the sport's ground
// (FieldLines, from the helper its live screen and break spread in:
// ovalField, netballCourt, soccerField, woodCourt, rugbyField), the kids
// as KidTiles on it, the empty spots as KidSlots, and the bench under it
// (KidBench). No zone colours, no bars, no white cards: a line says how
// many are on ("FORWARD 4 on", underlined when it's short) and a kid
// says what matters in words.
//
// It never asks which sport it's showing, and it keeps no state: each
// sport's picker owns its lineup and tap rules (AFL's empty-spot sheet,
// netball's bibs, soccer's keeper, league's vests…) and hands over the
// lines, the bench and what each kid's tile says.

import type { ReactNode } from "react";
import { FieldLines, type FieldLine, type FieldSurface } from "@/components/live/FieldLines";
import { KidBench } from "@/components/live/KidBench";
import { KidSlot, KidTile, type KidFigure, type KidOutKind } from "@/components/live/KidTile";
import { useSquadNames } from "@/components/live/SquadNames";
import type { KidWords } from "@/lib/live/kidWords";
import type { MixedGroup } from "@/lib/types";
import { LINEUP_TAP_HINT } from "@/components/lineup/lineupHints";

/** A kid the picker can draw. */
export interface PickerPlayer {
  id: string;
  full_name: string;
  jersey_number?: number | string | null;
}

/** One spot on the field: a kid, or an empty spot. */
export interface PickerCell {
  /** Stable key for the spot (its slot or position), not the kid. */
  key: string;
  playerId: string | null;
  /** A named position before the name: a netball bib, "CHB", "LFP". */
  pos?: string | null;
  /** Where the kid stands, as a screen reader hears it ("Goal Shooter", "Forward"). */
  place?: string | null;
  /** An empty spot's accessible name ("Empty FWD spot", "Goal Shooter, empty"). */
  emptyLabel: string;
  /** The coach tapped this empty spot first: it waits for a kid. */
  aimed?: boolean;
  onTap: () => void;
}

/** How a line's kids stand, where it isn't a plain grid (netball's zigzag, rugby's rows). */
export type PickerLineShape = Partial<Pick<FieldLine, "rows" | "rowsAlign" | "rowSide" | "cols">>;

export interface PickerLine {
  key: string;
  /** The margin label and the group's name ("Forward", "Attack third"). */
  label: string;
  cells: PickerCell[];
  shape?: (tiles: ReactNode[], cells: PickerCell[]) => PickerLineShape | undefined;
  /** Leave out the "4 on" count (a line of one, the keeper). */
  noCount?: boolean;
}

/** What one kid's tile says, beyond their name. */
export interface PickerKidLook {
  words?: KidWords | null;
  locked?: boolean;
  lockLabel?: string | null;
  flag?: string | null;
  figures?: KidFigure[] | null;
  group?: MixedGroup | null;
  out?: KidOutKind | null;
  under?: boolean;
  /** More for a screen reader, after the words ("Field locked", "Season: mostly Back"). */
  states?: (string | null | false | undefined)[];
  /** Overrides `player-tile-<id>`. */
  testId?: string;
}

export interface PickerFieldProps {
  /** The sport's ground, as its live screen draws it. */
  ground: FieldSurface;
  lines: PickerLine[];
  /** The bench, in order: who can come on, then anyone out. */
  bench: { playerId: string; onTap: () => void }[];
  players: ReadonlyMap<string, PickerPlayer>;
  /** The kid picked for a swap. */
  selectedId: string | null;
  /** An empty spot is aimed at (tapped first): the other empties stay calm. */
  aiming?: boolean;
  /** What each kid's tile says. */
  look?: (playerId: string, cell: PickerCell | null) => PickerKidLook | null | undefined;
  onLongPress?: (playerId: string) => void;
  /** "+ Late" after the bench. */
  late?: ReactNode;
  /** A line under the bench (netball's "everyone takes a turn"). */
  benchNote?: ReactNode;
  benchEmptyText?: string;
  /** Big squads: shorter bench rows. */
  denseBench?: boolean;
  /** The line over the field; null hides it. */
  hint?: ReactNode | null;
  /** The field wrapper's region name ("On field", "On court"). */
  regionLabel?: string;
  /** What it's drawn on, as data-surface (soccer's "pitch", "court", "hockey"). */
  surfaceName?: string;
}

export function PickerField({
  ground,
  lines,
  bench,
  players,
  selectedId,
  aiming = false,
  look,
  onLongPress,
  late,
  benchNote,
  benchEmptyText,
  denseBench,
  hint = LINEUP_TAP_HINT,
  regionLabel = "On field",
  surfaceName,
}: PickerFieldProps) {
  const names = useSquadNames();

  function kid(pid: string, cell: PickerCell | null, onTap: () => void): ReactNode {
    const p = players.get(pid);
    if (!p) return null;
    const l = look?.(pid, cell) ?? {};
    return (
      <KidTile
        testId={l.testId ?? `player-tile-${pid}`}
        name={names.tile(p)}
        spoken={{
          name: p.full_name,
          place: cell ? cell.place ?? cell.pos ?? null : null,
          number: p.jersey_number ?? null,
          states: l.states ?? [],
        }}
        place={cell ? "field" : "bench"}
        pos={cell?.pos ?? null}
        words={l.words ?? null}
        selected={selectedId === pid}
        under={l.under}
        locked={!!l.locked}
        lockLabel={l.lockLabel ?? null}
        flag={l.flag ?? null}
        figures={l.figures ?? null}
        group={l.group ?? null}
        out={l.out ?? null}
        dense={!!cell && !!ground.dense}
        onClick={onTap}
        onLongPress={onLongPress ? () => onLongPress(pid) : undefined}
      />
    );
  }

  const fieldLines: FieldLine[] = lines.flatMap((line) => {
    if (line.cells.length === 0) return [];
    const tiles = line.cells.map((cell) => (
      <div key={cell.key} className="min-w-0">
        {cell.playerId ? (
          kid(cell.playerId, cell, cell.onTap)
        ) : (
          <KidSlot
            label={cell.emptyLabel}
            text={
              (cell.pos ? `${cell.pos} · ` : "") +
              (cell.aimed ? "Tap a player" : selectedId ? "Move here" : "Empty")
            }
            hot={!!cell.aimed || (!!selectedId && !aiming)}
            onClick={cell.onTap}
          />
        )}
      </div>
    ));
    const on = line.cells.filter((c) => c.playerId).length;
    return [
      {
        key: line.key,
        label: line.label,
        tiles,
        count: line.noCount ? undefined : { text: `${on} on`, short: on < line.cells.length },
        ...line.shape?.(tiles, line.cells),
      },
    ];
  });

  return (
    <div className="flex flex-col gap-3">
      {hint && <p className="text-center text-xs text-ink-dim">{hint}</p>}
      <div data-testid="lineup-field" data-surface={surfaceName} role="region" aria-label={regionLabel} className="flex flex-col">
        <FieldLines lines={fieldLines} {...ground} />
      </div>
      <KidBench
        count={bench.length}
        dense={denseBench}
        emptyText={benchEmptyText}
        tiles={bench.map(({ playerId, onTap }) => (
          <div key={playerId} className="min-w-0">
            {kid(playerId, null, onTap)}
          </div>
        ))}
        late={late}
      />
      {benchNote}
    </div>
  );
}
