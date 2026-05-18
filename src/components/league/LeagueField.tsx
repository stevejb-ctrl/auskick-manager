"use client";

// ─── LeagueField — rugby league pitch ────────────────────────
// Visual playing surface for the rugby-league live view. Mirrors
// the shape of `Field.tsx` (AFL — oval pitch with zone rows) and
// `Court.tsx` (netball — rectangular court with thirds + goal
// circles), but styled as a rugby-league pitch in portrait (the
// only viable orientation on a mobile screen).
//
// Pitch furniture, matching the reference Steve sent (rotated 90°
// for portrait):
//   * Solid try lines at top and bottom.
//   * Dashed 5m line just inside each try line.
//   * Solid 10m line.
//   * Solid 20m line.
//   * Solid halfway line with a centre mark.
//   * Big white H-shape goal posts anchored on each try line, in
//     the centre — visually unmistakable rugby furniture.
//
// Player tiles laid over the centre band. RL is positionless at
// this age so the layout is one block of players rather than zone
// rows. When the lineup has fewer players than `onFieldSize`
// (e.g. someone was lent without a replacement), we render
// dashed-outline placeholder tiles so the gap is visible.

import type { Player } from "@/lib/types";
import type { VestType } from "@/lib/sports/rugby_league/vests";
import type { PlayerConversionStatus } from "@/lib/sports/rugby_league/kicks";
import { LeaguePlayerTile } from "./LeaguePlayerTile";

// ─── Field formation slots ──────────────────────────────────
// Approximate rugby league formation rendered in portrait, with
// our team attacking the TOP try line. The 11 slots break into:
//
//   Forwards (4) — two staggered rows at the top of the field.
//   FR + DH (2)  — middle, slightly staggered.
//   Backs (4)    — two staggered rows behind the halves.
//   Fullback (1) — alone at the back near our own try line.
//
// `x` is left-percentage from the pitch edge; `y` is top-percentage.
// Tiles are absolute-positioned with `translate(-50%, -50%)` so the
// coordinate is the centre of the tile. Coordinates are tuned for a
// 4:5 portrait pitch — change with care; tiles overlap fast.
type FieldSlotRole =
  | "forward"
  | "fr"
  | "dh"
  | "back"
  | "fullback";
interface FieldSlot {
  id: string;
  role: FieldSlotRole;
  x: number;
  y: number;
}

const FIELD_SLOTS: FieldSlot[] = [
  // Forwards — 2 rows of 2, closest to the opponent try line.
  // Inner pair sits higher (row-1), outer pair wider (row-2).
  { id: "fwd-1", role: "forward", x: 36, y: 18 },
  { id: "fwd-2", role: "forward", x: 64, y: 18 },
  { id: "fwd-3", role: "forward", x: 26, y: 31 },
  { id: "fwd-4", role: "forward", x: 74, y: 31 },
  // DH + FR — middle of the field, well separated and staggered.
  // DH stands closer to the ruck so it sits left + slightly higher;
  // FR is the first receiver, sitting right + slightly back.
  { id: "dh", role: "dh", x: 30, y: 45 },
  { id: "fr", role: "fr", x: 70, y: 52 },
  // Backs — 2 rows of 2 behind the halves. Outer pair wider
  // (centres/wingers), inner pair tighter.
  { id: "back-1", role: "back", x: 26, y: 64 },
  { id: "back-2", role: "back", x: 74, y: 64 },
  { id: "back-3", role: "back", x: 36, y: 77 },
  { id: "back-4", role: "back", x: 64, y: 77 },
  // Fullback — alone at the back.
  { id: "fullback", role: "fullback", x: 50, y: 88 },
];

/**
 * Assign each on-field player to a formation slot. FR / DH vest
 * wearers go to their named slots regardless of zone — they're
 * positional roles. Forwards fill the forward + dh slot (DH is a
 * forward position when not vested otherwise), backs fill the
 * back + fullback + fr slots. The fullback slot prefers the LAST
 * back in lineup order so the coach's explicit "this player is my
 * fullback" sort survives.
 *
 * When `forwardPlayers` / `backPlayers` aren't supplied, fall back
 * to the legacy "everyone in players order" routing so the
 * component still renders correctly for callers that haven't been
 * updated to pass the split.
 */
function arrangeFieldSlots(
  players: Player[],
  vestByPlayer: Record<string, VestType>,
  forwardPlayers?: Player[],
  backPlayers?: Player[],
): { slot: FieldSlot; player: Player | null }[] {
  const frPlayer = players.find((p) => vestByPlayer[p.id] === "fr") ?? null;
  const dhPlayer = players.find((p) => vestByPlayer[p.id] === "dh") ?? null;

  if (forwardPlayers && backPlayers) {
    // Zone-aware routing. Pull vest wearers out of their pool to
    // avoid double-placing them (they fill the FR/DH named slot
    // instead of a generic forward/back slot).
    const forwardsRest = forwardPlayers.filter(
      (p) => p.id !== frPlayer?.id && p.id !== dhPlayer?.id,
    );
    const backsRest = backPlayers.filter(
      (p) => p.id !== frPlayer?.id && p.id !== dhPlayer?.id,
    );
    // The last back becomes the fullback by convention. Coach can
    // change this by reordering the backs bucket via the picker /
    // long-press menu.
    const fullbackPlayer = backsRest.length > 0
      ? backsRest[backsRest.length - 1]
      : null;
    const backsForSlots = fullbackPlayer
      ? backsRest.slice(0, -1)
      : backsRest;
    let fwdIdx = 0;
    let backIdx = 0;
    return FIELD_SLOTS.map((slot) => {
      if (slot.role === "fr") return { slot, player: frPlayer };
      if (slot.role === "dh") return { slot, player: dhPlayer };
      if (slot.role === "fullback") return { slot, player: fullbackPlayer };
      if (slot.role === "forward") {
        const player = forwardsRest[fwdIdx] ?? null;
        if (player) fwdIdx++;
        return { slot, player };
      }
      // role === "back"
      const player = backsForSlots[backIdx] ?? null;
      if (player) backIdx++;
      return { slot, player };
    });
  }

  // Legacy path — no zone info, fill slots in declaration order.
  const rest = players.filter(
    (p) => p.id !== frPlayer?.id && p.id !== dhPlayer?.id,
  );
  let restIdx = 0;
  return FIELD_SLOTS.map((slot) => {
    if (slot.role === "fr") return { slot, player: frPlayer };
    if (slot.role === "dh") return { slot, player: dhPlayer };
    const player = rest[restIdx] ?? null;
    if (player) restIdx++;
    return { slot, player };
  });
}

interface LeagueFieldProps {
  /** Players currently on the field, in display order. Union of
   *  forwards + backs — used by the count chip and legacy routing
   *  fallback. New callers pass `forwardPlayers` + `backPlayers`
   *  too so the slot router can place each zone explicitly. */
  players: Player[];
  /** On-field forwards bucket. When supplied (along with
   *  `backPlayers`), drives zone-aware slot routing. */
  forwardPlayers?: Player[];
  /** On-field backs bucket. The LAST back is treated as the
   *  fullback unless the lineup is empty. */
  backPlayers?: Player[];
  /** Target on-field size — drives the vacant-spot placeholder render. */
  onFieldSize?: number;
  triesByPlayer?: Record<string, number>;
  totalMsByPlayer?: Record<string, number>;
  vestByPlayer?: Record<string, VestType>;
  conversionByPlayer?: Record<string, PlayerConversionStatus>;
  kickoffTakerIds?: Set<string>;
  injuredIds?: Set<string>;
  loanedIds?: Set<string>;
  selectedPlayerId?: string | null;
  onPlayerClick?: (playerId: string) => void;
  onPlayerLongPress?: (playerId: string) => void;
  /** Tap on a vacant slot — used to bring a selected bench player on. */
  onVacantSpotTap?: () => void;
  disabled?: boolean;
  /** Q1-kickoff wake-up halo trigger. */
  wakeUpKey?: number | null;
}

export function LeagueField({
  players,
  forwardPlayers,
  backPlayers,
  onFieldSize,
  triesByPlayer,
  totalMsByPlayer,
  vestByPlayer,
  conversionByPlayer,
  kickoffTakerIds,
  injuredIds,
  loanedIds,
  selectedPlayerId,
  onPlayerClick,
  onPlayerLongPress,
  onVacantSpotTap,
  disabled,
  wakeUpKey = null,
}: LeagueFieldProps) {
  return (
    <section
      aria-label="On field"
      className="relative flex w-full flex-col rounded-lg border border-emerald-800/60 bg-emerald-700 shadow-card"
    >
      {wakeUpKey !== null && (
        <span
          key={wakeUpKey}
          aria-hidden="true"
          className="siren-pulse-once pointer-events-none absolute inset-0 rounded-lg"
          style={
            {
              "--siren-pulse-r": "40px",
            } as React.CSSProperties
          }
        />
      )}
      <div className="relative overflow-hidden rounded-lg">
        {/* Portrait rugby-league pitch. The reference image is
            landscape (posts left+right); we rotate the same
            furniture 90° so the play axis runs top-to-bottom on a
            phone. 4:5 aspect keeps the pitch readable without
            dominating the viewport. */}
        <div className="relative aspect-[4/5] bg-emerald-600">
          {/* Touch line — solid white border around the pitch */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-1 rounded-sm border-2 border-white/80"
          />

          {/* Try line — top (solid). */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1 right-1 top-[8%] h-0.5 bg-white/80"
          />
          {/* Try line — bottom (solid). */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-[8%] left-1 right-1 h-0.5 bg-white/80"
          />

          {/* 5m line — top (dashed). 5m past the try line is the
              first defensive marker in junior RL; render dashed via
              a horizontal repeating linear-gradient. */}
          <DashedLine top="14%" />
          <DashedLine bottom="14%" />

          {/* 10m line — top + bottom (solid). */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1 right-1 top-[22%] h-px bg-white/60"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-[22%] left-1 right-1 h-px bg-white/60"
          />
          {/* 20m line — top + bottom (solid, lighter). */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1 right-1 top-[36%] h-px bg-white/50"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-[36%] left-1 right-1 h-px bg-white/50"
          />

          {/* Halfway line — solid white with a centre mark. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1 right-1 top-1/2 h-0.5 bg-white/80"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-white/80"
          />

          {/* Goal posts — large H anchored on each try line. The
              uprights stand on the line; the crossbar is the bar
              between the uprights. Drawn as SVG so the proportions
              stay clean at any size. */}
          <GoalPosts placement="top" />
          <GoalPosts placement="bottom" />

          {/* In-goal "TRY" labels in each corner of the in-goal
              areas (the strip between the touch line and the try
              line). */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-2 top-1 font-mono text-[9px] font-bold uppercase tracking-micro text-white/70"
          >
            Try
          </span>
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-1 right-2 font-mono text-[9px] font-bold uppercase tracking-micro text-white/70"
          >
            Try
          </span>

          {/* Player band — absolute-positioned slots in a rugby
              league formation (attacking the TOP try line). The
              `FIELD_SLOTS` array below lays out 11 reference
              positions; players are assigned by vest first (FR + DH
              into the middle slots), then the remaining fill the
              forwards / backs / fullback positions in lineup order.
              Unfilled slots render vacant placeholders so the gap is
              visible. */}
          {(() => {
            const arrangement = arrangeFieldSlots(
              players,
              vestByPlayer ?? {},
              forwardPlayers,
              backPlayers,
            );
            return arrangement.map(({ slot, player }) => {
              const slotStyle: React.CSSProperties = {
                left: `${slot.x}%`,
                top: `${slot.y}%`,
                width: "22%",
              };
              return (
                <div
                  key={slot.id}
                  style={slotStyle}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                >
                  {player ? (
                    <LeaguePlayerTile
                      player={player}
                      variant="field"
                      tries={triesByPlayer?.[player.id] ?? 0}
                      totalMs={totalMsByPlayer?.[player.id]}
                      vest={vestByPlayer?.[player.id] ?? null}
                      conversion={conversionByPlayer?.[player.id] ?? null}
                      kickedOff={kickoffTakerIds?.has(player.id) ?? false}
                      injured={injuredIds?.has(player.id) ?? false}
                      loaned={loanedIds?.has(player.id) ?? false}
                      selected={selectedPlayerId === player.id}
                      onClick={
                        onPlayerClick
                          ? () => onPlayerClick(player.id)
                          : undefined
                      }
                      onLongPress={
                        onPlayerLongPress
                          ? () => onPlayerLongPress(player.id)
                          : undefined
                      }
                      disabled={disabled}
                    />
                  ) : (
                    <VacantSpot
                      onTap={onVacantSpotTap}
                      disabled={disabled}
                    />
                  )}
                </div>
              );
            });
          })()}

          {/* Top-right corner counter — `N / target` so the
              shortfall is also legible from the corner glance
              (matches the picker's prominent count pill). */}
          {typeof onFieldSize === "number" ? (
            <span
              aria-hidden
              className={`pointer-events-none absolute right-2 top-2 inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums shadow-card ${
                players.length === onFieldSize
                  ? "bg-emerald-900/70 text-white"
                  : "bg-warn text-white"
              }`}
            >
              {players.length} / {onFieldSize}
            </span>
          ) : (
            <span
              aria-hidden
              className="pointer-events-none absolute right-2 top-2 rounded-full bg-emerald-900/70 px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums text-white"
            >
              {players.length}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Goal posts ──────────────────────────────────────────────
// H-shape rendered with two thick uprights and a crossbar. Sits
// directly on the try line so the post base aligns with the goal-
// line stripe — same as the reference image. Drawn at a fixed
// pixel size that scales with the viewport via the parent's
// aspect ratio (the bottom/top anchor handles vertical placement).
function GoalPosts({ placement }: { placement: "top" | "bottom" }) {
  const anchor
    = placement === "top"
      ? "top-[8%] -translate-y-[40%]"
      : "bottom-[8%] translate-y-[40%]";
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute left-1/2 ${anchor} -translate-x-1/2`}
    >
      <svg
        width="48"
        height="20"
        viewBox="0 0 48 20"
        fill="none"
        className="block"
      >
        {/* Crossbar — runs between the uprights only. The uprights
            sit at x=14 and x=34 so the crossbar spans 14→34, not
            past the uprights as it would on a soccer goal. */}
        <line
          x1="14"
          y1="8"
          x2="34"
          y2="8"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Left upright */}
        <line
          x1="14"
          y1="1"
          x2="14"
          y2="19"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Right upright */}
        <line
          x1="34"
          y1="1"
          x2="34"
          y2="19"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

// ─── Dashed reference line ──────────────────────────────────
// Used for the 5m line. Rendered as a row of absolute-positioned
// segments so the dash pattern reads cleanly across screen widths
// without depending on SVG dasharray (which doesn't scale with the
// container the way we want at this resolution).
function DashedLine({ top, bottom }: { top?: string; bottom?: string }) {
  const positionClass
    = top !== undefined ? "left-1 right-1" : "left-1 right-1";
  const style: React.CSSProperties = {};
  if (top !== undefined) style.top = top;
  if (bottom !== undefined) style.bottom = bottom;
  return (
    <div
      aria-hidden
      style={style}
      className={`pointer-events-none absolute h-px ${positionClass} flex justify-between`}
    >
      {Array.from({ length: 16 }).map((_, i) => (
        <span
          key={i}
          className="block h-px w-2 bg-white/50"
          aria-hidden
        />
      ))}
    </div>
  );
}

// ─── Vacant-spot placeholder ────────────────────────────────
// Renders an empty player tile slot so the field shortfall is
// visible at a glance. When `onTap` is provided, it becomes a
// button — tapping it brings the currently-selected bench player
// onto the field (orchestrator handles the lineup_set write).
// Dashed border matches the "lend a player" affordance in the
// lineup picker so coaches recognise it as a "needs filling" slot.
function VacantSpot({
  onTap,
  disabled,
}: {
  onTap?: () => void;
  disabled?: boolean;
}) {
  const baseClasses
    = "flex w-full items-center justify-center rounded-md border border-dashed border-white/70 bg-white/10 px-1.5 py-3 text-center text-[11px] font-medium text-white/80";
  if (onTap) {
    return (
      <button
        type="button"
        onClick={onTap}
        disabled={disabled}
        aria-label="Empty slot — tap to bring a bench player on"
        className={`${baseClasses} transition-all duration-fast ease-out-quart hover:bg-white/20 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="font-mono uppercase tracking-micro">Empty</span>
      </button>
    );
  }
  return (
    <div role="presentation" className={baseClasses}>
      <span className="font-mono uppercase tracking-micro">Empty</span>
    </div>
  );
}
