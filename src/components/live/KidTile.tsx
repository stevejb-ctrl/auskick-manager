"use client";

// ─── KidTile ─────────────────────────────────────────────────
// Live v3's kid (Steve, 8 Nov 2026): a name in chalk on a faint plate,
// no border, no shadow, no coloured edge. One kid looks the same in
// every sport; each sport's screen works out the words and passes them.
//
//        ③                       the pair badge: the swap's number,
//   Ollie 2.1                    chalk, hi-vis once the sub is due
//   Off next                     at most one line of words (kidWords)
//
// - The name (short: "Jack S"), a position before it where a sport names
//   them ("CHB"), and a small score once they've scored ("2.1").
// - One line of words under it, from lib/live/kidWords: "Off next",
//   "On next → FWD", hi-vis "Off now" when the sub is due, "Needs 6′
//   more" in sun. A kid who's out (INJ, HOME, LENT, SIT 1:20) says so
//   beside the name instead, the way their tiles always have.
// - The badge is the pair's number only: the words say where they go.
// - States: selected (a solid plate, the kid's name in ink), due (a 2 px
//   hi-vis edge), under the minimum (a sun edge), dimmed, held (a lock).
// - On the field it's chalk on the grass; on the bench, ink on the
//   chalk page (KidBench).
//
// The jumper number and minutes aren't on the tile: they're in the kid
// bar and the player sheet. A screen reader still hears them, in the
// order every tile's name has (tileName): the kid, where they are,
// number, time, then the words ("Off next, pair 2").

import { useEffect, useRef, useState } from "react";
import { useLongPress } from "@/lib/live/useLongPress";
import { tileName, type TileNameParts } from "@/components/live/tileName";
import type { KidWords } from "@/lib/live/kidWords";

/** Why a kid is out of the rotation: their badge's colour. */
export type KidOutKind = "injured" | "home" | "lent" | "sit" | "fouledOut";

/** A small figure after a kid's name (KidTile `figures`). */
export interface KidFigure {
  key: string;
  text: string;
  /** Its label (aria-label on the figure). */
  label?: string;
  testId?: string;
  /** Close to a limit: full strength, bold. */
  strong?: boolean;
  /** At (or one short of) a limit: underlined as well. */
  underline?: boolean;
}

export interface KidTileProps {
  /** The tile's test id ("player-tile-<id>"); its key for the swap fade too. */
  testId: string;
  /** The name shown: short, "Jack S" beside another Jack (SquadNames). */
  name: string;
  /** What a screen reader hears, less the words and badge (KidTile adds them). */
  spoken: Omit<TileNameParts, "states"> & { states?: TileNameParts["states"] };
  /** On the grass (chalk on green) or the bench (ink on chalk). */
  place: "field" | "bench";
  /** A named position before the name ("CHB"). */
  pos?: string | null;
  /** The score figure once they've scored ("2.1"), and how it's said. */
  score?: { text: string; label: string } | null;
  /** The one line under the name (kidWords). An out kid's goes beside the name. */
  words?: KidWords | null;
  /** The pair's number while a sub is planned; hot once it's due. */
  badge?: { n: number; hot: boolean } | null;
  selected?: boolean;
  /** In the sub that's due: the hi-vis edge. */
  due?: boolean;
  /** At risk of the game-time minimum: the sun edge. */
  under?: boolean;
  dimmed?: boolean;
  /** Held on (Keep on / Keep in a line): a small lock after the name. */
  locked?: boolean;
  /** What the lock means ("Field locked"): on the lock, as the old tiles' chip said it. */
  lockLabel?: string | null;
  /** Out of the rotation (hurt, home, lent, sitting, fouled out). */
  out?: KidOutKind | null;
  /** Big fields: a shorter tile and name. */
  dense?: boolean;
  /**
   * A small flag on the tile's top-left corner: rugby's FR / DH vest.
   * Seen only: say it in `spoken.states`.
   */
  flag?: string | null;
  /**
   * More small figures after the name, before the score: basketball's
   * fouls ("F3", underlined at the limit) and points ("8 PTS"). Each can
   * carry its own label and test id; seen only otherwise, so say them
   * in `spoken.states` too.
   */
  figures?: KidFigure[] | null;
  onClick?: () => void;
  onLongPress?: () => void;
}

const LOCK = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-[10px] w-[10px]" aria-hidden>
    <path
      fillRule="evenodd"
      d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
      clipRule="evenodd"
    />
  </svg>
);

/** "On next → FWD" said as "On next to FWD". */
function spokenWords(w: KidWords): string {
  return w.spoken ?? w.text.replace(/\s*→\s*/, " to ");
}

export function KidTile({
  testId,
  name,
  spoken,
  place,
  pos = null,
  score = null,
  words = null,
  badge = null,
  selected = false,
  due = false,
  under = false,
  dimmed = false,
  locked = false,
  lockLabel = null,
  out = null,
  dense = false,
  flag = null,
  figures = null,
  onClick,
  onLongPress,
}: KidTileProps) {
  const { handlers, arming, consumedLongPress } = useLongPress({ onLongPress });
  const field = place === "field";

  // A new kid in the same spot (a sub made): their name rises in.
  const prev = useRef(testId);
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    if (prev.current !== testId) {
      prev.current = testId;
      setFresh(Date.now());
    }
  }, [testId]);

  const label = tileName({
    ...spoken,
    states: [
      words ? spokenWords(words) : null,
      badge ? `pair ${badge.n}` : null,
      ...(spoken.states ?? []),
    ],
  });

  // The plate. On the grass the colours are the grass's own in both
  // themes (mark / mark-ink); on the bench they follow the page.
  const plate = selected
    ? field
      ? "bg-mark text-mark-ink"
      : "bg-primary text-on-primary"
    : out
      ? field
        ? "bg-transparent text-mark shadow-[inset_0_0_0_1px_rgb(247_250_245/0.32)]"
        : "bg-transparent text-ink shadow-[inset_0_0_0_1px_rgb(var(--l-hairline))]"
      : field
        ? "bg-mark/[0.07] text-mark"
        : "bg-[rgb(var(--t-ink)/0.045)] text-ink";
  // The edge: due beats under; a picked kid shows the due edge still.
  const edge = due
    ? "shadow-[inset_0_0_0_2px_rgb(var(--c-hivis))]"
    : under && !selected
      ? field
        ? "shadow-[inset_0_0_0_1.5px_rgb(var(--c-sun))]"
        : "shadow-[inset_0_0_0_1.5px_rgb(var(--l-sun))]"
      : "";

  // The words' colour by tone, on whichever plate.
  const wordsClass = !words
    ? ""
    : words.tone === "hot"
      ? "self-start max-w-full rounded-[5px] bg-hivis px-[5px] py-px font-extrabold text-hivis-ink"
      : words.tone === "sun"
        ? selected
          ? "font-extrabold"
          : field
            ? "font-extrabold text-[rgb(var(--c-sun))]"
            : "font-extrabold text-sun"
        : selected
          ? "opacity-75"
          : field
            ? "text-mark/[0.84]"
            : "text-ink-mute";

  // INJ, HOME, LENT sit beside the name; anything longer goes under it.
  const outBelow = !!out && !!words && words.text.length > 5;
  const outTone =
    selected ? "opacity-75" : field ? "text-mark/[0.72]" : out === "injured" ? "text-blood" : "text-ink-mute";

  const badgeClass = badge?.hot
    ? "bg-hivis text-hivis-ink"
    : field
      ? "bg-mark text-mark-ink"
      : "bg-primary text-on-primary";

  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      aria-pressed={selected}
      onClick={() => {
        if (consumedLongPress()) return;
        onClick?.();
      }}
      {...handlers}
      disabled={!onClick && !onLongPress}
      className={[
        "relative flex h-full min-h-[44px] w-full min-w-0 flex-col justify-center gap-[3px] rounded-[10px] px-[8px] text-left",
        "[transition:background-color_160ms_ease,opacity_160ms_ease,box-shadow_160ms_ease,transform_120ms_cubic-bezier(0.2,0.8,0.2,1)]",
        plate,
        edge,
        // Big fields at large text: a taller tap target (58 px).
        dense ? "bigtext:min-h-[58px]" : "",
        dimmed && !selected ? "opacity-[0.32]" : "",
        onClick || onLongPress ? "motion-safe:active:scale-[0.97]" : "cursor-default",
        arming && !selected ? (field ? "ring-2 ring-mark/50" : "ring-2 ring-hairline") : "",
      ].join(" ")}
    >
      {flag && (
        <span
          aria-hidden
          data-testid="kid-flag"
          className={`absolute -left-[4px] -top-[7px] z-[2] flex h-[18px] min-w-[22px] items-center justify-center rounded-[9px] px-[5px] font-display text-[0.5625rem] font-black leading-none tracking-[0.06em] ${
            field
              ? "bg-field text-mark shadow-[inset_0_0_0_1.5px_rgb(247_250_245/0.62)]"
              : "bg-warm text-ink shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))]"
          }`}
        >
          {flag}
        </span>
      )}
      {badge && (
        <span
          aria-hidden
          data-testid="pair-badge"
          className={`absolute -right-[5px] -top-[7px] z-[2] flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] px-[5px] font-display text-[0.65625rem] font-black leading-none ${badgeClass}`}
        >
          {badge.n}
        </span>
      )}
      <span className="flex min-w-0 items-baseline gap-[5px] whitespace-nowrap font-display stretch-72 leading-[1.05]">
        {pos && <span className="flex-none text-[0.6875rem] font-extrabold tracking-[0.05em] opacity-[0.76]">{pos}</span>}
        <span
          key={fresh || undefined}
          className={`min-w-0 max-w-full flex-[0_1_auto] truncate font-extrabold ${dense ? "text-base" : "text-[1.0625rem]"} ${
            fresh ? "motion-safe:animate-roll-in-up" : ""
          }`}
        >
          {name}
        </span>
        {!out && figures?.map((f) => (
          <span
            key={f.key}
            data-testid={f.testId}
            aria-label={f.label}
            className={`min-w-0 flex-none overflow-hidden text-[0.71875rem] font-extrabold ${f.strong || f.underline ? "" : "opacity-[0.72]"} ${
              f.underline ? "underline decoration-[1.5px] underline-offset-[2px]" : ""
            }`}
          >
            {f.text}
          </span>
        ))}
        {score && !out && <span className="min-w-0 flex-shrink-[2] overflow-hidden text-[0.71875rem] font-extrabold opacity-[0.72]">{score.text}</span>}
        {locked && !out && (
          <span aria-label={lockLabel ?? undefined} className="inline-flex flex-none opacity-70">
            {LOCK}
          </span>
        )}
        {out && words && !outBelow && (
          <span className={`ml-auto flex-none text-[0.625rem] font-black tracking-[0.1em] ${outTone}`}>{words.text}</span>
        )}
      </span>
      {/* A long out badge (basketball's FOULED OUT, SIT 4:12) goes under
          the name, so a bench tile three across keeps the name whole. */}
      {out && words && outBelow && (
        <span className={`block min-w-0 truncate font-display text-[0.625rem] font-black tracking-[0.1em] ${outTone}`}>{words.text}</span>
      )}
      {words && !out && (
        <span className={`block min-w-0 truncate font-display stretch-72 text-[0.75rem] font-bold leading-[1.15] ${wordsClass}`}>
          {words.text}
        </span>
      )}
    </button>
  );
}

/**
 * An empty spot on the field: a dashed outline in chalk. "Move here" while
 * a kid is picked, "Tap a player" when the coach aimed at it first.
 */
export function KidSlot({
  label,
  text,
  hot = false,
  onClick,
}: {
  /** What a screen reader hears ("Empty FWD spot"). */
  label: string;
  text: string;
  /** A kid is picked (or the slot was aimed at): the outline goes solid. */
  hot?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-full min-h-[44px] w-full min-w-0 items-center rounded-[10px] border-[1.5px] px-[8px] text-left font-display stretch-72 text-[0.8125rem] font-bold transition-colors duration-fast ease-out-quart ${
        hot ? "border-solid border-mark/[0.85] text-mark" : "border-dashed border-mark/[0.32] text-mark/[0.72] hover:border-mark/60"
      }`}
    >
      <span className="truncate">{text}</span>
    </button>
  );
}
