"use client";

// ─── LeagueField — the rugby pitch (league and union) ────────
// The rugby live field (league and union), as AFL's Field: the shared
// card tiles (LeaguePlayerTile on LinePlayerTile) in the formation's rows,
// Forwards above Backs, on the green with halfway between (UI polish round 2,
// Steve 23 Oct 2026; it was pill tokens at formation spots on a drawn
// pitch). The formation slots still decide who's where: FR / DH vest
// wearers, the fullback, union's named positions; each line keeps their
// order down the pitch. Short of the size, dashed empty places show the
// gap.

import type { Player } from "@/lib/types";
import type { VestType } from "@/lib/sports/rugby_league/vests";
import type { PlayerConversionStatus } from "@/lib/sports/rugby_league/kicks";
import {
  getFieldSlots,
  pickBestForSlot,
  unionFieldSlots,
  type FieldSlot,
} from "@/lib/sports/rugby_league/fieldFormation";
import type { RugbySport } from "@/lib/sports/registry";
import { placeByPosition } from "@/lib/sports/rugby/fieldPositions";

import { LeaguePlayerTile } from "./LeaguePlayerTile";

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
  slots: FieldSlot[],
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
    const result: { slot: FieldSlot; player: Player | null }[] = slots.map(
      (slot) => {
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
      },
    );
    // Overflow pass — if the lineup has more forwards than the
    // formation has forward slots (or vice versa), the excess
    // players were silently dropped by the zone-respecting first
    // pass. Place them in any still-empty slot so every on-field
    // player is visible.
    //
    // CHIP-PREFERENCE-AWARE ROUTING (Steve 2026-05-23): a previous
    // version just shifted overflow off the front in declaration
    // order, which would shove a back-chipped player into an empty
    // forward slot when an unchipped option was also available. The
    // U10 case that triggered this: FR + DH both drawn from the
    // forwards bucket → only 3 forward-bucket players left for 5
    // forward slots → 2 empty fwd slots. Backs bucket had a mix of
    // B-chipped and unchipped players spilling over; the old logic
    // placed whichever came first in the array regardless of chip.
    //
    // Fix: when filling an empty slot from the cross-zone overflow,
    // pick the LEAST-mismatched candidate first. Unchipped players
    // (no chip preference) go to wrong-zone slots before strongly
    // zone-chipped players are forced there.
    //
    // Within-zone overflow (forward-bucket surplus into a forward
    // slot, or back-bucket surplus into a back slot) preserves
    // declaration order — those are right-zone placements anyway.
    const fwdOverflow: Player[] = forwardsRest.slice(fwdIdx);
    const backOverflow: Player[] = backsForSlots.slice(backIdx);

    for (const row of result) {
      if (row.player) continue;
      // Resolve the target zone for this slot. fullback counts as
      // a back position; fr / dh slots shouldn't reach here (the
      // first pass fills them by vest), but if they do, default to
      // back for fr and forward for dh per their real-RL position.
      const slotZone: "forward" | "back" =
        row.slot.role === "forward" || row.slot.role === "dh"
          ? "forward"
          : "back";
      // Prefer same-zone overflow first (right-zone placement,
      // declaration order preserved), then cross-zone overflow
      // with chip-mismatch-aware pick.
      const sameZonePool
        = slotZone === "forward" ? fwdOverflow : backOverflow;
      const crossZonePool
        = slotZone === "forward" ? backOverflow : fwdOverflow;
      const picked
        = sameZonePool.shift()
        ?? pickBestForSlot(crossZonePool, slotZone);
      if (!picked) break;
      row.player = picked;
    }
    return result;
  }

  // Legacy path — no zone info, fill slots in declaration order.
  const rest = players.filter(
    (p) => p.id !== frPlayer?.id && p.id !== dhPlayer?.id,
  );
  let restIdx = 0;
  return slots.map((slot) => {
    if (slot.role === "fr") return { slot, player: frPlayer };
    if (slot.role === "dh") return { slot, player: dhPlayer };
    const player = rest[restIdx] ?? null;
    if (player) restIdx++;
    return { slot, player };
  });
}

interface LeagueFieldProps {
  /** The team's rugby sport: its pitch markings. */
  sport: RugbySport;
  /**
   * Forwards at each on-field size, when the sport states its split
   * (union): the field is laid out from it at any size. Without it,
   * league's hand-made formations.
   */
  forwardsBySize?: Record<number, number>;
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
  /** Target on-field size — drives the formation slot count and
   *  vacant-spot placeholder render. Required for accurate per-age
   *  layouts (U6 = 6 slots, U10 = 11, U12 = 13, etc.). */
  onFieldSize?: number;
  /** Vest gates from the age-group config — controls whether the
   *  FR / DH named slots appear in the formation. Defaults to
   *  no-vests (U6/U7 shape) when omitted. */
  vestRequirements?: { fr: boolean; dh: boolean };
  triesByPlayer?: Record<string, number>;
  totalMsByPlayer?: Record<string, number>;
  /** Opt-in: per-player F/C/B time split — drives the stacked time
   *  bar at the bottom of each tile. Pass undefined to hide the bar
   *  entirely (default). */
  zoneMsByPlayer?: Record<string, import("@/lib/sports/rugby_league/fairness").LeagueZoneMs>;
  vestByPlayer?: Record<string, VestType>;
  /** Named positions: playerId → position label on the tile. */
  positionLabels?: Record<string, string>;
  /**
   * Named positions: each line's labels in their listed order. Union
   * stands each kid in their position's spot, row by row (a U11 backline:
   * Halfback / Centre / Five-eighth, then Left wing / Fullback / Right
   * wing). League keeps its own formation routing (vest slots).
   */
  positionOrder?: Record<"forwards" | "backs", string[]>;
  /** Kids with a season keep-on role (lineup screens). */
  keepOnIds?: Set<string>;
  conversionByPlayer?: Record<string, PlayerConversionStatus>;
  kickoffTakerIds?: Set<string>;
  injuredIds?: Set<string>;
  loanedIds?: Set<string>;
  selectedPlayerId?: string | null;
  /**
   * Map of field-player id → pair index (1-based) for suggested
   * subs OFF. When a player is in this map their tile renders
   * with the amber "going off" treatment so the coach can spot
   * the next rotation without reading the card above the field.
   * Mirrors AFL `Field.tsx`'s `swapOffs` prop.
   */
  swapOffs?: Map<string, number>;
  /** The sub card is in its SUB DUE state: the off tiles turn amber. */
  swapDue?: boolean;
  /** Total pairs in the current rotation suggestion. Drives the
   *  per-tile pair-number badge — shown only when totalPairs > 1
   *  so a single-swap rotation reads as a clean arrow. */
  totalSwapPairs?: number;
  /** Per-chip modes from the team row (split / group / forward /
   *  back). Forwarded to each tile so zone-mode chips render the
   *  F/B letter inside the dot. */
  chipModes?: Partial<
    Record<import("@/lib/chips").ChipKey, import("@/lib/chips").ChipMode>
  >;
  onPlayerClick?: (playerId: string) => void;
  onPlayerLongPress?: (playerId: string) => void;
  /**
   * Tap on a vacant slot. Two routes through this callback:
   *
   *   1. Bench player selected → bring them on. The slot's zone
   *      tells the caller which zone to place them into (so a coach
   *      tapping the empty FWD slot lands the bench player in FWD
   *      regardless of their chip).
   *   2. Field player selected (mid-quarter only) → move them to
   *      the tapped zone via `league_position_change`. This is the
   *      "swap-to-empty" affordance that lets a coach shift a
   *      short-squad blank slot from forwards to backs (or vice
   *      versa) without restarting the lineup. Steve 2026-05-23
   *      port of AFL's commit 8a92f71.
   *
   * `zone` is derived from the tapped slot's role: "forward" for
   * forward / DH slots, "back" for back / FR / fullback slots.
   * The orchestrator decides which path to take based on what's
   * currently selected.
   */
  onVacantSpotTap?: (zone: "forward" | "back") => void;
  /**
   * When true, vacant slots advertise themselves as a "Move here"
   * target — visible cue that the tap will land an action.
   * Typically wired to "a player is currently selected" upstream.
   */
  vacantSpotPrimed?: boolean;
  disabled?: boolean;
  /** Q1-kickoff wake-up halo trigger. */
  wakeUpKey?: number | null;
}

export function LeagueField({
  sport,
  forwardsBySize,
  players,
  forwardPlayers,
  backPlayers,
  onFieldSize,
  vestRequirements,
  triesByPlayer,
  totalMsByPlayer,
  zoneMsByPlayer,
  vestByPlayer,
  positionLabels,
  positionOrder,
  keepOnIds,
  conversionByPlayer,
  kickoffTakerIds,
  injuredIds,
  loanedIds,
  selectedPlayerId,
  swapOffs,
  swapDue = false,
  totalSwapPairs = 0,
  chipModes,
  onPlayerClick,
  onPlayerLongPress,
  onVacantSpotTap,
  vacantSpotPrimed = false,
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
      {/* The pitch, as AFL's field: the lines' card tiles in the
          formation's rows (two or three across), Forwards above Backs
          with halfway between
          (UI polish round 2, Steve 23 Oct 2026; the pill tokens sat at
          formation spots on a drawn pitch). Named positions keep their
          order within a line; the slots below still decide who's where. */}
      <div className="relative overflow-hidden rounded-lg px-3 pb-4 pt-3">
        <div aria-hidden className="pointer-events-none absolute inset-1.5 rounded-md border-[1.5px] border-white/[0.22]" />
        {(() => {
          // Never fewer spots than kids on the field: a lineup over
          // the size (the size dropped after kickoff) still shows
          // every kid rather than hiding one.
          const size = Math.max(typeof onFieldSize === "number" ? onFieldSize : 11, players.length);
          const slots = forwardsBySize
            ? unionFieldSlots(size, forwardsBySize[size] ?? Math.floor(size / 2))
            : getFieldSlots(size, vestRequirements);
          // Union with named positions: each kid in their position's
          // spot (fieldPositions.ts). Otherwise the lineup-order routing.
          const placed =
            forwardsBySize && positionOrder && positionLabels && forwardPlayers && backPlayers
              ? placeByPosition(
                  slots,
                  forwardPlayers.map((p) => p.id),
                  backPlayers.map((p) => p.id),
                  positionLabels,
                  positionOrder,
                )
              : null;
          const byId = new Map([...players, ...(forwardPlayers ?? []), ...(backPlayers ?? [])].map((p) => [p.id, p]));
          const arrangement = placed
            ? slots.map((slot) => ({ slot, player: byId.get(placed[slot.id] ?? "") ?? null }))
            : arrangeFieldSlots(players, vestByPlayer ?? {}, slots, forwardPlayers, backPlayers);
          const forwardIds = new Set((forwardPlayers ?? []).map((p) => p.id));
          const backIds = new Set((backPlayers ?? []).map((p) => p.id));
          const lineOf = (slot: FieldSlot, player: Player | null): "forwards" | "backs" => {
            if (player && forwardIds.has(player.id)) return "forwards";
            if (player && backIds.has(player.id)) return "backs";
            return slot.role === "forward" || slot.role === "dh" ? "forwards" : "backs";
          };
          // Down the pitch: the formation's rows top to bottom, left to right.
          const ordered = [...arrangement].sort((a, b) => a.slot.y - b.slot.y || a.slot.x - b.slot.x);
          const groups = (["forwards", "backs"] as const).map((line) => ({
            line,
            entries: ordered.filter(({ slot, player }) => lineOf(slot, player) === line),
          }));

          const cell = ({ slot, player }: { slot: FieldSlot; player: Player | null }, line: "forwards" | "backs") =>
            player ? (
              <LeaguePlayerTile
                player={player}
                variant="field"
                line={line}
                tries={triesByPlayer?.[player.id] ?? 0}
                totalMs={totalMsByPlayer?.[player.id]}
                zoneMs={zoneMsByPlayer?.[player.id]}
                vest={vestByPlayer?.[player.id] ?? null}
                positionLabel={positionLabels?.[player.id] ?? null}
                keepOn={keepOnIds?.has(player.id) ?? false}
                conversion={conversionByPlayer?.[player.id] ?? null}
                kickedOff={kickoffTakerIds?.has(player.id) ?? false}
                injured={injuredIds?.has(player.id) ?? false}
                loaned={loanedIds?.has(player.id) ?? false}
                selected={selectedPlayerId === player.id}
                dimmed={!!selectedPlayerId && selectedPlayerId !== player.id}
                swap={
                  swapOffs?.has(player.id)
                    ? { role: "off", pair: swapOffs.get(player.id)!, totalPairs: totalSwapPairs }
                    : null
                }
                swapDue={swapDue}
                chipModes={chipModes}
                onClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
                onLongPress={onPlayerLongPress ? () => onPlayerLongPress(player.id) : undefined}
                disabled={disabled}
              />
            ) : (
              <VacantSpot
                slotZone={line === "forwards" ? "forward" : "back"}
                onTap={onVacantSpotTap}
                primed={vacantSpotPrimed}
                disabled={disabled}
              />
            );

          return groups.map(({ line, entries }, gi) => {
            if (entries.length === 0) return null;
            // The formation's rows, as on the pitch (Steve 17 Oct: union's
            // front row, then the 2nd row and N8, …): each its own line,
            // left to right; a lone kid (the fullback, a vest) centred.
            const rows: (typeof entries)[] = [];
            for (const e of entries) {
              const last = rows[rows.length - 1];
              if (last && last[0].slot.y === e.slot.y) last.push(e);
              else rows.push([e]);
            }
            return (
              <div key={line} className={gi > 0 ? "relative mt-4 pt-4" : "relative"}>
                {gi > 0 && <div aria-hidden className="pointer-events-none absolute -left-3 -right-3 top-0 h-px bg-white/[0.28]" />}
                <p className="relative mb-2 px-1 font-mono text-[10px] font-bold uppercase tracking-micro text-white/75">
                  {line === "forwards" ? "Forwards" : "Backs"}
                </p>
                <div role="group" aria-label={line === "forwards" ? "Forwards" : "Backs"} className="relative space-y-2">
                  {rows.map((row) => (
                    <div key={row[0].slot.id} className={`grid gap-2 ${row.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                      {row.map((entry) => (
                        <div key={entry.slot.id} className={row.length === 1 ? "col-span-2 mx-auto w-[calc(50%-0.25rem)]" : undefined}>
                          {cell(entry, line)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          });
        })()}

        {/* Top-right corner counter — `N / target` so the shortfall is
            also legible from the corner glance (matches the picker's
            prominent count pill). */}
        {typeof onFieldSize === "number" ? (
          <span
            aria-hidden
            className={`pointer-events-none absolute right-2.5 top-2.5 inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
              players.length === onFieldSize ? "bg-emerald-900/70 text-white" : "bg-warn text-white"
            }`}
          >
            {players.length} / {onFieldSize}
          </span>
        ) : (
          <span
            aria-hidden
            className="pointer-events-none absolute right-2.5 top-2.5 rounded-full bg-emerald-900/70 px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums text-white"
          >
            {players.length}
          </span>
        )}
      </div>
    </section>
  );
}

// ─── Vacant-spot placeholder ────────────────────────────────
// Renders an empty player tile slot so the field shortfall is
// visible at a glance. When `onTap` is provided, it becomes a
// button:
//   * a bench player is selected → tapping promotes them to the
//     field, targeting the tapped zone (so a coach tapping the
//     empty FWD slot lands them in FWD regardless of chip);
//   * a field player is selected → tapping moves THAT player to
//     this slot's zone via `league_position_change` (the short-
//     squad "shift the blank to the other zone" affordance).
// Dashed border matches the "lend a player" affordance in the
// lineup picker so coaches recognise it as a "needs filling" slot.
// When `primed` is true (something's selected), the copy flips to
// "Move here" + brand-tinted border so the affordance reads as
// actionable rather than passive. Steve 2026-05-23.
function VacantSpot({
  slotZone,
  onTap,
  primed,
  disabled,
}: {
  slotZone: "forward" | "back";
  onTap?: (zone: "forward" | "back") => void;
  primed?: boolean;
  disabled?: boolean;
}) {
  const baseClasses
    = "flex w-full items-center justify-center rounded-md border border-dashed px-1.5 py-3 text-center text-[11px] font-medium";
  const passiveTone = "border-white/70 bg-white/10 text-white/80";
  // When primed, swap the muted white-on-green look for a brand-
  // tinted dash so the empty slot reads as a tap target — same
  // colour family the selected player tile + swap suggestion use.
  const primedTone
    = "border-warm bg-warm/15 text-warm shadow-card";
  const tone = primed ? primedTone : passiveTone;
  const label = primed ? "Move here" : "Empty";
  if (onTap) {
    return (
      <button
        type="button"
        onClick={() => onTap(slotZone)}
        disabled={disabled}
        aria-label={
          primed
            ? `Move selected player to ${slotZone === "forward" ? "forwards" : "backs"}`
            : "Empty slot — tap to bring a bench player on"
        }
        className={`${baseClasses} ${tone} transition-all duration-fast ease-out-quart hover:bg-white/20 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="font-mono uppercase tracking-micro">{label}</span>
      </button>
    );
  }
  return (
    <div role="presentation" className={`${baseClasses} ${passiveTone}`}>
      <span className="font-mono uppercase tracking-micro">Empty</span>
    </div>
  );
}
