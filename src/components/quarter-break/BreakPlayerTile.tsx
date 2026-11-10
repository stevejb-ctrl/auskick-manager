"use client";

// One kid on the period break screen (docs/handoffs/siren-footy-break-
// redesign-HANDOFF.md §2.6), worn as live v3's kid (KidTile's plate:
// kidPlate), so the break looks like the game it pauses (Steve, 10 Nov
// 2026). On the field it's chalk on solid ground; on the bench, ink on
// the chalk page (KidBench).
//
//   GS Ava 2          the tag (#jumper, a netball bib or a rugby
//   From GA  08:12    position), the name, notes and any score; under
//                     it where they've come from ("Stays", "From Fwd",
//                     "From bench") and their game time, in sun when
//                     they're well under the team average. The time
//                     wraps under the words rather than cutting them.
//
// The name is the squad's short one ("Jack S"), as every tile has it; a
// screen reader hears the whole name (tileName). Sizes are in rem, so
// they grow with the phone's text size; the padding is in px, so the
// growth goes to the words (UX round 3, e4).

import { useLongPress } from "@/lib/live/useLongPress";
import { tileName } from "@/components/live/tileName";
import { KID_NAME_SIZE, KidSlot, kidPlate } from "@/components/live/KidTile";
import { MixedMark, mixedMarkSpoken } from "@/components/live/MixedMark";
import type { MixedGroup } from "@/lib/types";

export interface BreakTileModel {
  playerId: string | null;
  /** "#7", a bib "GS", or "" (netball's bench). */
  tag: string;
  /** The tag is a bib or position (it names where they stand). */
  tagIsBib: boolean;
  /** The whole name, as a screen reader hears it. */
  name: string;
  /** The name on the tile: the squad's short one ("Jack S"). */
  shown?: string;
  /** Goals/points this game ("1.0", "3"), with how to say it. */
  score?: { text: string; label: string };
  /** Small notes after the name (basketball fouls, a league vest). */
  tags?: string[];
  /** A mixed team's G or B (MixedMark), coach view only. */
  group?: MixedGroup;
  /** "Stays" / "From Fwd" / "From bench", or the sidelined status. */
  movement: string;
  time: string;
  lowTime: boolean;
  /** Injured / lent / fouled out: shown faded, can't be swapped. */
  sidelined: boolean;
  /** Empty slot: what to call it ("FWD", "GS"). */
  emptyLabel?: string;
}

interface Props {
  tile: BreakTileModel;
  /** On the field (chalk on its ground) or the bench (ink on the page). */
  place: "field" | "bench";
  testId?: string;
  selected: boolean;
  /** Another tile is selected and this one can take the swap. */
  target: boolean;
  /** Big fields: a smaller name. */
  dense?: boolean;
  onTap: () => void;
  onLongPress?: () => void;
}

export function BreakPlayerTile({ tile, place, testId, selected, target, dense = false, onTap, onLongPress }: Props) {
  const longPress = useLongPress({ onLongPress: tile.playerId && onLongPress ? onLongPress : undefined });
  const field = place === "field";

  if (!tile.playerId) {
    // An empty spot: the field's dashed chalk outline (KidSlot), its bib
    // first where it has one ("GS · Empty").
    const words = selected ? "Tap a player" : target ? "Move here" : "Empty";
    return (
      <KidSlot
        label={`Empty ${tile.emptyLabel ?? ""} spot`.replace(/\s+/g, " ")}
        text={tile.tagIsBib && tile.tag ? `${tile.tag} · ${words}` : words}
        hot={selected || target}
        onClick={onTap}
      />
    );
  }

  // A kid who can take the swap: a faint edge, chalk on the field.
  const edge = target && !selected
    ? field
      ? "shadow-[inset_0_0_0_1.5px_rgb(var(--c-mark)/0.45)]"
      : "shadow-[inset_0_0_0_1.5px_rgb(var(--t-ink)/0.28)]"
    : "";
  const dim = selected ? "opacity-75" : field ? "text-mark/[0.84]" : "text-ink-mute";
  const low = selected ? "font-extrabold" : field ? "font-extrabold text-[rgb(var(--c-sun))]" : "font-extrabold text-sun";

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => {
        if (longPress.consumedLongPress()) return;
        onTap();
      }}
      {...longPress.handlers}
      aria-pressed={selected}
      // The kid first, as every tile reads (tileName): name, bib or
      // number, time, then where they've come from and any notes.
      aria-label={tileName({
        name: tile.name,
        place: tile.tagIsBib ? tile.tag : null,
        number: tile.tagIsBib ? null : tile.tag || null,
        time: tile.time,
        states: [mixedMarkSpoken(tile.group), tile.movement, ...(tile.tags ?? []), tile.score?.label, tile.lowTime && "Low game time"],
      })}
      disabled={tile.sidelined}
      className={[
        // A size container: the name scales to the tile's width (KidTile).
        "relative flex h-full min-h-[48px] w-full min-w-0 flex-col justify-center gap-[3px] rounded-[10px] px-[8px] py-[6px] text-left [container-type:inline-size]",
        "[transition:background-color_160ms_ease,opacity_160ms_ease,box-shadow_160ms_ease,transform_120ms_cubic-bezier(0.2,0.8,0.2,1)]",
        "motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
        kidPlate(place, { selected, out: tile.sidelined }),
        edge,
        longPress.arming && !selected ? (field ? "ring-2 ring-mark/50" : "ring-2 ring-hairline") : "",
      ].join(" ")}
    >
      <span className="flex w-full min-w-0 items-baseline gap-[5px] whitespace-nowrap font-display stretch-72 leading-[1.05]">
        {/* A bib or position names the spot, so it stays; a jumper
            number leaves the field tile to the name, as in play (a row of
            four cut "Joaquin" to "Joa…"). The bench, wider, keeps it. */}
        {tile.tag && (tile.tagIsBib || !field) && (
          <span className={`flex-none text-[0.6875rem] tracking-[0.05em] ${tile.tagIsBib ? "font-extrabold opacity-[0.76]" : "font-bold opacity-[0.6]"}`}>
            {tile.tag}
          </span>
        )}
        <span className={`min-w-0 max-w-full flex-[0_1_auto] truncate font-extrabold ${KID_NAME_SIZE[dense ? "dense" : "full"]}`}>
          {tile.shown ?? tile.name}
        </span>
        {tile.group && <MixedMark group={tile.group} className="self-center" />}
        {tile.tags?.map((t) => (
          <span key={t} className="flex-none text-[0.625rem] font-black tracking-[0.06em] opacity-[0.72]">
            {t}
          </span>
        ))}
        {tile.score && (
          <span aria-label={tile.score.label} className="flex-none text-[0.71875rem] font-extrabold opacity-[0.72]">
            {tile.score.text}
          </span>
        )}
      </span>
      <span className="flex w-full min-w-0 flex-wrap items-baseline gap-x-[6px] font-display stretch-72 text-[0.75rem] font-bold leading-[1.2]">
        <span className={tile.sidelined ? `font-black tracking-[0.04em] ${field ? "text-mark/[0.84]" : "text-blood"}` : dim}>
          {tile.movement}
        </span>
        <span className={`ml-auto font-mono text-[0.6875rem] tabular-nums ${tile.lowTime ? low : dim}`}>{tile.time}</span>
      </span>
    </button>
  );
}
