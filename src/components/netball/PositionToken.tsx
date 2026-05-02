"use client";

// ─── Position token ──────────────────────────────────────────
// Rectangular player card rendered inside a third on the Court.
// Visually mirrors AFL's PlayerTile (src/components/live/PlayerTile.tsx)
// so the design language stays consistent across sports — rounded-md,
// hairline border, surface bg, hover state, monospace position chip
// up top with a sky-accent, bold first-name + last-initial below,
// optional INJ / LENT / lock badges floated top-left.
//
// Two interactions:
//   tap        → onTap (open player picker / record goal for GS/GA)
//   long-press → onLongPress (open actions menu — injury / loan / lock)
// Long-press is a 500ms timer started on pointerdown; if it fires, the
// trailing onClick is suppressed via a ref so the same gesture doesn't
// double-fire. Mirrors the AFL PlayerTile implementation.

import { useRef } from "react";
import { netballSport, primaryThirdFor } from "@/lib/sports/netball";
import { formatMinSec, type PlayerThirdMs } from "@/lib/sports/netball/fairness";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";

interface PositionTokenProps {
  positionId: string;
  playerName?: string | null;
  onTap?: () => void;
  /** Triggered after a 500ms hold; suppresses the trailing tap. */
  onLongPress?: () => void;
  selected?: boolean;
  /** Visually greys out the token when the player is ineligible. */
  ineligible?: boolean;
  /** Period-break-only: disabled during live play. */
  disabled?: boolean;
  /**
   * GS/GA only — adds a subtle "tap to score" visual cue. Doesn't change
   * the tap handler itself; the parent decides what tapping does.
   */
  canScore?: boolean;
  /** Player flagged as injured this game — show INJ badge + greyscale. */
  injured?: boolean;
  /** Player lent to opposition this game — show LENT badge + greyscale. */
  loaned?: boolean;
  /** Player locked to this position for the next quarter break. */
  locked?: boolean;
  /** Per-third minutes-played breakdown — drives the colour-coded time bar. */
  stats?: PlayerThirdMs;
  /** Total ms played this game — rendered as mm:ss under the name. */
  totalMs?: number;
  /** Goals scored by this player this game — drives the dark chip in the top-right corner. */
  goalCount?: number;
  /**
   * Pulse trigger — when this changes (e.g. a mid-quarter sub
   * commits at this position), the brand halo fires once on the
   * tile. Passed null/undefined to suppress (every tile that
   * hasn't been touched in this quarter). Mirrors the
   * clockPulseKey pattern on GameHeader / NetballScoreBug.
   */
  pulseKey?: string | number | null;
}

const THIRD_BAR_COLOR: Record<"attack" | "centre" | "defence", string> = {
  attack: "bg-zone-f",
  centre: "bg-zone-c",
  defence: "bg-zone-b",
};
// Same palette as the time-bar segments above, but as text colours
// — so the position chip on a token reads in the same colour as the
// third's slice in the time bar. Lets a coach scan a card and
// instantly map "purple chip = centre time, blue chip = defence time"
// without remembering the legend.
const THIRD_TEXT_COLOR: Record<"attack" | "centre" | "defence", string> = {
  attack: "text-zone-f",
  centre: "text-zone-c",
  defence: "text-zone-b",
};

export function PositionToken({
  positionId,
  playerName,
  onTap,
  onLongPress,
  selected,
  ineligible,
  disabled,
  canScore,
  injured,
  loaned,
  locked,
  stats,
  totalMs,
  goalCount,
  pulseKey,
}: PositionTokenProps) {
  const pos = netballSport.allPositions.find((p) => p.id === positionId);
  const short = pos?.shortLabel ?? positionId.toUpperCase();

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!onLongPress) return;
    didLongPressRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      longPressTimerRef.current = null;
      onLongPress();
    }, 500);
  }

  function cancelLongPress() {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleClick() {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    onTap?.();
  }

  // Pull a "First L" display name like the AFL tile.
  const parts = (playerName ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : "";
  const display = playerName
    ? lastInitial
      ? `${firstName} ${lastInitial}`
      : firstName
    : "—";

  // Container styling — rounded rectangle, hairline border, hover-aware.
  // Selected state borrows the AFL brand-ring; canScore borrows an amber
  // halo to read as "tap me to record a goal". Solid bg-white + shadow
  // on every state so cards POP off the sky-50 court bg (the previous
  // bg-surface token was visually too washed out against the blue).
  const baseBg = selected
    ? "border-brand-600 bg-white ring-2 ring-brand-500 shadow-pop"
    : injured
    ? "border-danger/40 bg-white shadow-card"
    : loaned
    ? "border-warn/40 bg-white shadow-card"
    : ineligible
    ? "border-neutral-300 bg-neutral-100"
    : canScore
    ? "border-sky-700 bg-white ring-1 ring-amber-300/70 shadow-card hover:bg-amber-50"
    : "border-hairline bg-white shadow-card hover:border-ink-mute";

  // The button is what visually IS the tile. SirenPulseHalo wraps
  // it so a brand halo can fire when this position takes a sub
  // (handled by the parent — passes a fresh pulseKey when the
  // sub commits). When pulseKey is null/undefined the halo
  // wrapper's halo span is omitted entirely — zero DOM cost on
  // tiles that haven't been subbed this quarter.
  //
  // `rounded-md` on the wrapper matches the button's `rounded-md`
  // so the halo's box-shadow follows the tile's curve instead of
  // emanating from a square wrapper.
  return (
    <SirenPulseHalo triggerKey={pulseKey} size="sm" className="rounded-md">
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerUp={onLongPress ? cancelLongPress : undefined}
      onPointerCancel={onLongPress ? cancelLongPress : undefined}
      disabled={disabled}
      className={[
        "relative flex w-24 flex-col items-stretch rounded-md border text-center transition-all duration-fast ease-out-quart",
        baseBg,
        injured || loaned ? "grayscale" : "",
        disabled ? "cursor-not-allowed" : "",
      ].join(" ")}
      aria-label={`${pos?.label ?? positionId}${playerName ? `, ${playerName}` : ", empty"}`}
    >
      {/* Goal-count chip — floats above top-right corner so it never
          eats tile height. Mirrors AFL's score chip at PlayerTile.tsx:179.
          Hidden when zero so brand-new tokens stay clean. */}
      {goalCount !== undefined && goalCount > 0 && (
        <span
          className="nums absolute -right-1 -top-1.5 z-10 inline-flex items-center gap-0.5 rounded-xs bg-ink px-1 py-0.5 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-warm shadow-card"
          aria-label={`${goalCount} goal${goalCount === 1 ? "" : "s"}`}
        >
          <span>{goalCount}</span>
        </span>
      )}

      {/* Status badges floated top-left, mirrors AFL PlayerTile. Stacked
          priority: INJ > LENT > LOCK so coaches see the highest-impact
          flag first. */}
      {injured && (
        <span
          className="absolute left-1 top-1 rounded-xs bg-danger px-1 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white"
          aria-label="Injured"
        >
          INJ
        </span>
      )}
      {loaned && !injured && (
        <span
          className="absolute left-1 top-1 rounded-xs bg-warn px-1 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white"
          aria-label="Lent to opposition"
        >
          LENT
        </span>
      )}
      {locked && !injured && !loaned && (
        <span
          className="absolute left-1 top-1 rounded-xs bg-brand-600 p-0.5 leading-none text-white"
          aria-label="Locked at this position for the next quarter break"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-2.5 w-2.5"
          >
            <path
              fillRule="evenodd"
              d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      )}

      <div className="flex flex-1 flex-col items-center justify-center px-1.5 py-1">
        {/* Position chip — text colour matches the third's time-bar
            colour (forward=orange, centre=purple, defence=blue) so
            the legend is implicit. Falls back to neutral ink-dim
            when the position has no third (shouldn't happen in
            netball, but keeps the type-narrowing tidy). */}
        <span
          className={`font-mono text-[9px] font-bold uppercase leading-none tracking-micro ${
            (() => {
              const t = primaryThirdFor(positionId);
              if (t === "attack-third") return THIRD_TEXT_COLOR.attack;
              if (t === "centre-third") return THIRD_TEXT_COLOR.centre;
              if (t === "defence-third") return THIRD_TEXT_COLOR.defence;
              return "text-ink-dim";
            })()
          }`}
        >
          {short}
        </span>

        {/* Player name — first + last initial, bold, truncated */}
        <span className="truncate text-sm font-bold leading-tight text-ink">
          {display}
        </span>

        {/* Time + colour-coded bar share a single row to keep token
            height compact (the centre band has to fit three tokens
            inside one third of the court). */}
        {stats && totalMs !== undefined && totalMs > 0 && (() => {
          const total = totalMs || 1;
          const pct = (v: number) => `${(v / total) * 100}%`;
          return (
            <span className="mt-0.5 flex w-full items-center gap-1">
              <span className="nums font-mono text-[9px] font-semibold leading-none text-ink-dim">
                {formatMinSec(totalMs)}
              </span>
              <span
                className="flex h-1 flex-1 overflow-hidden rounded-full bg-surface-alt"
                aria-label={`Attack ${formatMinSec(stats.attack)}, Centre ${formatMinSec(stats.centre)}, Defence ${formatMinSec(stats.defence)}`}
              >
                <span style={{ width: pct(stats.attack) }} className={THIRD_BAR_COLOR.attack} />
                <span style={{ width: pct(stats.centre) }} className={THIRD_BAR_COLOR.centre} />
                <span style={{ width: pct(stats.defence) }} className={THIRD_BAR_COLOR.defence} />
              </span>
            </span>
          );
        })()}
      </div>
    </button>
    </SirenPulseHalo>
  );
}
