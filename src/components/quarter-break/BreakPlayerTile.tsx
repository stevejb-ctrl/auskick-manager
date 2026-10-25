"use client";

// One slot on the period break screen (docs/handoffs/siren-footy-break-
// redesign-HANDOFF.md §2.6): the tag (#jumper, or a netball bib in its
// zone's colour), the name and any score; under it a dot in the colour
// of where the kid ended last period, where they've come from ("Stays",
// "From Fwd", "From bench") and their game time, orange when they're
// well under the team average. Every sport's break uses it.
//
// The name is in rem, so it grows with the phone's text size as the tag
// and time do; the padding is in px, so the growth goes to the words
// (UX round 3, e4: at 200% px names stayed small and cut to "Leo…").

import { useLongPress } from "@/lib/live/useLongPress";
import { ZONE_SWATCH, ZONE_TEXT, type BreakColor } from "@/components/quarter-break/breakZoneTokens";

export interface BreakTileModel {
  playerId: string | null;
  /** "#7", a bib "GS", or "" (netball's bench). */
  tag: string;
  /** The tag is a bib: shown bold in the zone's colour. */
  tagIsBib: boolean;
  zoneColor: BreakColor;
  name: string;
  /** Goals/points this game ("1.0", "3"), with how to say it. */
  score?: { text: string; label: string };
  /** Small notes after the name (basketball fouls, a league vest). */
  tags?: string[];
  /** "Stays" / "From Fwd" / "From bench", or the sidelined status. */
  movement: string;
  fromColor: BreakColor;
  time: string;
  lowTime: boolean;
  /** Injured / lent / fouled out: shown faded, can't be swapped. */
  sidelined: boolean;
  /** Empty slot: what to call it ("FWD", "GS"). */
  emptyLabel?: string;
}

interface Props {
  tile: BreakTileModel;
  testId?: string;
  selected: boolean;
  /** Another tile is selected and this one can take the swap. */
  target: boolean;
  onTap: () => void;
  onLongPress?: () => void;
}

export function BreakPlayerTile({ tile, testId, selected, target, onTap, onLongPress }: Props) {
  const longPress = useLongPress({ onLongPress: tile.playerId && onLongPress ? onLongPress : undefined });
  const border = selected ? "border-brand-600 bg-brand-50" : target ? "border-brand-200 bg-surface" : "border-hairline bg-surface";

  if (!tile.playerId) {
    return (
      <button
        type="button"
        onClick={onTap}
        aria-pressed={selected}
        aria-label={`Empty ${tile.emptyLabel ?? ""} spot`.replace(/\s+/g, " ")}
        className={`flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[12px] border-2 border-dashed px-2.5 py-2 text-[13px] font-semibold text-ink-dim transition-colors duration-fast ease-out-quart ${
          selected ? "border-brand-600 bg-brand-50" : target ? "border-brand-300" : "border-hairline"
        }`}
      >
        {tile.tagIsBib && <span className={`font-mono text-xs font-bold ${ZONE_TEXT[tile.zoneColor]}`}>{tile.tag}</span>}
        <span>{selected ? "Tap a player" : target ? "Move here" : "Empty"}</span>
      </button>
    );
  }

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
      disabled={tile.sidelined}
      className={`flex min-h-[56px] w-full min-w-0 flex-col justify-center gap-[3px] rounded-[12px] border-2 px-[10px] py-[8px] text-left text-ink transition-colors duration-fast ease-out-quart disabled:cursor-not-allowed disabled:opacity-55 ${border} ${
        longPress.arming ? "ring-2 ring-brand-300" : ""
      }`}
    >
      <span className="flex w-full min-w-0 items-baseline gap-[6px]">
        {tile.tag && (
          <span
            className={`shrink-0 font-mono text-xs ${tile.tagIsBib ? `font-bold ${ZONE_TEXT[tile.zoneColor]}` : "font-medium text-ink-dim"}`}
          >
            {tile.tag}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[0.9375rem] font-semibold">{tile.name}</span>
        {tile.tags?.map((t) => (
          <span key={t} className="shrink-0 font-mono text-[10px] font-bold uppercase text-ink-dim">
            {t}
          </span>
        ))}
        {tile.score && (
          <span aria-label={tile.score.label} className="shrink-0 font-mono text-[11px] font-semibold text-ink">
            {tile.score.text}
          </span>
        )}
      </span>
      <span className="flex w-full min-w-0 items-center gap-[6px] text-xs text-ink-dim">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${tile.sidelined ? "bg-danger" : ZONE_SWATCH[tile.fromColor]}`} />
        <span className={`min-w-0 truncate ${tile.sidelined ? "font-semibold text-danger" : ""}`}>{tile.movement}</span>
        <span className={`ml-auto shrink-0 font-mono tabular-nums ${tile.lowTime ? "font-semibold text-zone-f" : ""}`}>
          {tile.time}
        </span>
      </span>
    </button>
  );
}
