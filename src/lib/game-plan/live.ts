// ─── Plan-ahead rotation — live-seeded projector + pin honour ──────
// The pre-game projector (./project) builds a fair rotation from a cold
// start. Mid-game, the coach wants to plan the rotation AHEAD of the
// next break: review the upcoming sub (F1) or build the next period
// (F2). Both reuse the SAME sport-agnostic projector — they just seed it
// from the CURRENT on-field reality instead of a from-scratch suggestion.
//
// This module holds:
//   • `projectUpcomingRotation` — pure adapter that runs `projectGamePlan`
//     for the whole game, then anchors the period the coach is IN to the
//     live lineup (period[0] of the returned plan = current reality),
//     leaving later periods projected forward.
//   • `PlannedRotation` — the shape the live store persists once a coach
//     pins a plan (F1 pinned swaps and/or F2 next-period lineup).
//   • `resolveHonouredSwaps` — pure decision the live game uses when a
//     sub falls due: honour a VALID pin, otherwise fall back to the live
//     suggester. A stale/invalid pin is discarded whole (D-09).
//
// No Supabase, no React, no clock — pure functions, safe to unit-test and
// to call from a client component on every tweak.

import { projectGamePlan, computeTotals } from "./project";
import type { GamePlan, GamePlanPeriod, ProjectGamePlanInput } from "./types";
import type { Lineup, Zone } from "@/lib/types";
import type { SwapSuggestion } from "@/lib/fairness";

/**
 * Input to `projectUpcomingRotation`. Everything `projectGamePlan` needs,
 * plus the live anchor: which period the coach is in and who is on the
 * field / bench right now.
 */
export interface ProjectUpcomingRotationInput extends ProjectGamePlanInput {
  /** 0-based index of the period the coach is currently in. */
  fromPeriodIndex: number;
  /** groupId -> on-field player ids RIGHT NOW (mirrors live reality). */
  currentGroups: Record<string, string[]>;
  /** Ordered interchange / bench right now (index 0 = next on). */
  currentBench: string[];
}

function clonePeriod(p: GamePlanPeriod): GamePlanPeriod {
  return {
    period: p.period,
    label: p.label,
    groups: p.groups.map((g) => ({ ...g, playerIds: [...g.playerIds] })),
    bench: [...p.bench],
  };
}

/**
 * Project the rotation from the current period forward, anchored to live
 * reality. Calls `projectGamePlan` for the whole game (NO per-sport
 * projection re-implemented here), slices to the upcoming periods so the
 * current one becomes `period[0]`, then OVERWRITES that period so its
 * groups/bench mirror `currentGroups`/`currentBench` exactly — the coach
 * is mid-game, so the period they are in must reflect what's actually on
 * the field, not a cold suggestion. Later periods stay as projected.
 *
 * Pure + deterministic: the input is never mutated and a fixed seed yields
 * a deep-equal plan.
 */
export function projectUpcomingRotation(
  input: ProjectUpcomingRotationInput,
): GamePlan {
  const full = projectGamePlan(input);

  const lastIndex = Math.max(0, full.periods.length - 1);
  const fromIndex = Math.min(Math.max(0, input.fromPeriodIndex), lastIndex);

  // Upcoming = current period → end, with the current period at index 0.
  // Absolute period numbers/labels are preserved (period[0].label = "Q2").
  const upcoming = full.periods.slice(fromIndex).map(clonePeriod);

  // Anchor the current period to live reality.
  const current = upcoming[0];
  current.groups = current.groups.map((g) => ({
    ...g,
    playerIds: [...(input.currentGroups[g.groupId] ?? [])],
  }));
  current.bench = [...input.currentBench];

  const playerIds = input.players.map((p) => p.id);
  return {
    ...full,
    periods: upcoming,
    totals: computeTotals(upcoming, playerIds),
  };
}

/**
 * A coach's pinned rotation plan for the active game. Client-local
 * (persisted by the live store's partialize, keyed by `gameId`) — there's
 * no server trust and no new game-event type (D-04/D-05).
 *
 * F1 fields (`pinnedForPeriod` / `pinnedSwaps`) override the imminent
 * within-period sub; F2 fields (`nextPeriod*`, consumed in plan 11-02)
 * pre-build the next period's lineup.
 */
export interface PlannedRotation {
  /** Game this pin belongs to — ignored on read if it isn't the active game. */
  gameId: string;

  // ── F1: override the imminent within-period sub (AFL rolling subs) ──
  /** 1-indexed period the pinned swaps apply to. */
  pinnedForPeriod?: number;
  /** Off/on/zone pairs to honour when the sub falls due (advisory). */
  pinnedSwaps?: SwapSuggestion[];

  // ── F2: build the next period's lineup (consumed in plan 11-02) ──
  /** 0-based index of the period this next-period plan targets. */
  nextPeriodIndex?: number;
  /** groupId -> planned player ids for the next period. */
  nextPeriodGroups?: Record<string, string[]>;
  /** Planned interchange / bench for the next period. */
  nextPeriodBench?: string[];
}

export interface ResolveHonouredSwapsInput {
  /** The coach's pinned plan, or null when nothing is pinned. */
  pin: PlannedRotation | null | undefined;
  /** 1-indexed current period (currentQuarter). */
  currentPeriod: number;
  /** Current live lineup (on-field zones + bench). */
  lineup: Lineup;
  /** Players currently injured (excluded from rotation). */
  injuredIds: readonly string[];
  /** Players currently loaned to the opposition. */
  loanedIds: readonly string[];
  /** What the live suggester would pick — used when the pin can't be honoured. */
  fallback: SwapSuggestion[];
}

/**
 * Decide which swaps the live game should SUGGEST when a sub falls due:
 * the pinned swaps when the pin is valid for this period, otherwise the
 * live suggester's `fallback`.
 *
 * D-09 stale guard: every pinned swap must reference an outgoing player
 * who is still on the field and an incoming player who is still on a
 * swappable bench (not injured, not loaned). If ANY pair is invalid — or
 * the pin is for a different period, or absent — the whole pin is
 * discarded and the fallback is returned. An invalid swap is never
 * applied.
 */
export function resolveHonouredSwaps(
  input: ResolveHonouredSwapsInput,
): SwapSuggestion[] {
  const { pin, currentPeriod, lineup, injuredIds, loanedIds, fallback } = input;
  if (!pin) return fallback;
  if (pin.pinnedForPeriod !== currentPeriod) return fallback;

  const swaps = pin.pinnedSwaps;
  if (!swaps || swaps.length === 0) return fallback;

  const onField = new Set<string>([
    ...lineup.back,
    ...lineup.hback,
    ...lineup.mid,
    ...lineup.hfwd,
    ...lineup.fwd,
  ]);
  const bench = new Set(lineup.bench);
  const injured = new Set(injuredIds);
  const loaned = new Set(loanedIds);

  const everyPairValid = swaps.every((s) => {
    const outgoingOnField = onField.has(s.off_player_id);
    const incomingSwappable =
      bench.has(s.on_player_id) &&
      !injured.has(s.on_player_id) &&
      !loaned.has(s.on_player_id);
    return outgoingOnField && incomingSwappable;
  });

  return everyPairValid ? swaps : fallback;
}

export interface SeedNextPeriodLineupInput {
  /** The coach's pinned plan, or null/undefined when nothing is pinned. */
  pin: PlannedRotation | null | undefined;
  /** 0-based index of the upcoming period the break leads INTO. */
  periodIndex: number;
  /** Players available for the upcoming period (NOT injured/loaned/out). */
  availableIds: readonly string[];
  /** The groupIds this sport expects (AFL zones / netball positions / RL forwards-backs). */
  groupIds: readonly string[];
}

/** A reconciled next-period seed: groupId -> on-field ids + the bench. */
export interface SeededLineup {
  groups: Record<string, string[]>;
  bench: string[];
}

/**
 * Build the PRE-SEEDED lineup a sport's break should open on when the
 * coach pinned the next period ahead of time (F2), or `null` when there's
 * no applicable pin and the break should fall back to its own suggestion.
 *
 * Sport-neutral: `groupIds` are opaque strings, so the SAME contract holds
 * for AFL zones, netball positions, and rugby-league forwards/backs.
 *
 * Returns `null` (no seed) when there is no pin, or the pin targets a
 * DIFFERENT period (`nextPeriodIndex !== periodIndex`), or the pin carries
 * no next-period groups.
 *
 * D-13 stale reconcile: a pinned player who is no longer available for the
 * upcoming period (injured / loaned / marked out) is dropped from BOTH the
 * field and the bench — never fielded — so the break's existing
 * suggester/draft fills the freed slot. The output always has an entry for
 * every expected `groupId` (empty if the pin placed none there), giving
 * each consumer a stable shape.
 *
 * Pure + deterministic: the pin is never mutated; equal inputs yield a
 * deep-equal result.
 */
export function seedNextPeriodLineup(
  input: SeedNextPeriodLineupInput,
): SeededLineup | null {
  const { pin, periodIndex, availableIds, groupIds } = input;
  if (!pin) return null;
  if (pin.nextPeriodIndex !== periodIndex) return null;
  if (!pin.nextPeriodGroups) return null;

  const available = new Set(availableIds);

  const groups: Record<string, string[]> = {};
  for (const groupId of groupIds) {
    const pinned = pin.nextPeriodGroups[groupId] ?? [];
    groups[groupId] = pinned.filter((id) => available.has(id));
  }

  const bench = (pin.nextPeriodBench ?? []).filter((id) => available.has(id));

  return { groups, bench };
}

export interface DiffPlanToSwapsInput {
  /** groupId -> player ids in the EDITED current period (post-tweak). */
  editedGroups: Record<string, string[]>;
  /** Bench in the EDITED current period. */
  editedBench: string[];
  /** groupId -> player ids ON THE FIELD right now (live reality). */
  liveGroups: Record<string, string[]>;
  /** Bench right now (live reality). */
  liveBench: string[];
}

/**
 * Derive the pinned swaps from a coach's edited current period (F1).
 *
 * The coach tweaks the upcoming rotation tap-to-swap; we translate the
 * net difference from live reality into AFL rolling-sub pairs. Only
 * GENUINE bench↔field subs are emitted, matched per-zone:
 *
 *   • an INCOMING player came on from the live bench into this zone,
 *   • an OUTGOING player left this zone to the edited bench.
 *
 * The zone is the group id, which is BOTH the outgoing player's live
 * zone (so `applySwap`'s `lineup[zone].map(off→on)` finds them) and the
 * incoming player's edited destination — the honoured swap lands the
 * sub exactly where the coach placed it.
 *
 * Field↔field zone reshuffles and bench reorders produce no swaps (they
 * aren't subs). A cross-zone move (a bench player landing in a different
 * zone than the one vacated) intentionally doesn't pair here — it falls
 * through to the live suggester rather than risk an invalid swap (D-09).
 *
 * Pure + deterministic: inputs are never mutated; equal inputs yield a
 * deep-equal result.
 */
export function diffPlanToSwaps(input: DiffPlanToSwapsInput): SwapSuggestion[] {
  const { editedGroups, editedBench, liveGroups, liveBench } = input;
  const liveBenchSet = new Set(liveBench);
  const editedBenchSet = new Set(editedBench);
  const swaps: SwapSuggestion[] = [];

  for (const groupId of Object.keys(liveGroups)) {
    const liveFieldZ = liveGroups[groupId] ?? [];
    const editedFieldZ = editedGroups[groupId] ?? [];

    const offs = liveFieldZ.filter((id) => editedBenchSet.has(id));
    const ons = editedFieldZ.filter((id) => liveBenchSet.has(id));

    const pairs = Math.min(offs.length, ons.length);
    for (let i = 0; i < pairs; i++) {
      swaps.push({
        off_player_id: offs[i],
        on_player_id: ons[i],
        zone: groupId as Zone,
        gap: 0,
      });
    }
  }
  return swaps;
}

// ─── Inline SwapCard override (F1 inline) ─────────────────────────
// The coach can override the upcoming sub WITHOUT leaving the live
// field: tap the incoming chip on the SwapCard to pick a different
// bench player, or the outgoing chip to pick a different same-zone
// field player. These pure helpers compute the eligible options and
// apply the edit. The edited swap array is pinned via the SAME
// `plannedRotation` slice the Plan-Ahead planner writes (so the live
// game honours it through `resolveHonouredSwaps` when the sub falls
// due) — there is one pin wire, not two.

function onFieldIdsByZone(lineup: Lineup, zone: Zone): string[] {
  return [...(lineup[zone] ?? [])];
}

export interface SwapOverrideEligibilityInput {
  /** Current effective swap pairs shown on the card (post-honour). */
  swaps: SwapSuggestion[];
  /** Index of the pair being edited. */
  pairIndex: number;
  /** Live lineup (on-field zones + bench). */
  lineup: Lineup;
  /** Players currently injured (cannot rotate). */
  injuredIds: readonly string[];
  /** Players currently loaned to the opposition (cannot rotate). */
  loanedIds: readonly string[];
  /** Players locked to their spot (cannot rotate). */
  lockedIds: readonly string[];
}

/**
 * Bench players the coach may pick to come ON in place of the current
 * incoming player for `pairIndex`. Fit bench only (not injured /
 * loaned / locked) and never a player already incoming in ANOTHER pair
 * — so two overrides compose without bringing the same kid on twice
 * (spec item 5). The pair's CURRENT incoming player is included (it's
 * on the bench and used only by this pair), so the picker can show it
 * highlighted as the live selection.
 */
export function eligibleOnReplacements(
  input: SwapOverrideEligibilityInput,
): string[] {
  const { swaps, pairIndex, lineup, injuredIds, loanedIds, lockedIds } = input;
  const injured = new Set(injuredIds);
  const loaned = new Set(loanedIds);
  const locked = new Set(lockedIds);
  const usedByOthers = new Set(
    swaps.filter((_, i) => i !== pairIndex).map((s) => s.on_player_id),
  );
  return lineup.bench.filter(
    (id) =>
      !injured.has(id) &&
      !loaned.has(id) &&
      !locked.has(id) &&
      !usedByOthers.has(id),
  );
}

/**
 * On-field players the coach may pick to come OFF in place of the
 * current outgoing player for `pairIndex`. Same zone only (the
 * honoured swap lands the incoming player exactly where the outgoing
 * one was — `applySwap` maps within the zone), fit only, and never a
 * player already outgoing in ANOTHER pair. The pair's CURRENT outgoing
 * player is included so the picker can highlight the live selection.
 */
export function eligibleOffReplacements(
  input: SwapOverrideEligibilityInput,
): string[] {
  const { swaps, pairIndex, lineup, injuredIds, loanedIds, lockedIds } = input;
  const pair = swaps[pairIndex];
  if (!pair) return [];
  const injured = new Set(injuredIds);
  const loaned = new Set(loanedIds);
  const locked = new Set(lockedIds);
  const usedByOthers = new Set(
    swaps.filter((_, i) => i !== pairIndex).map((s) => s.off_player_id),
  );
  return onFieldIdsByZone(lineup, pair.zone).filter(
    (id) =>
      !injured.has(id) &&
      !loaned.has(id) &&
      !locked.has(id) &&
      !usedByOthers.has(id),
  );
}

/**
 * Apply an inline override to one pair and return a NEW swap array
 * (input never mutated). `change.off` / `change.on` replace the
 * outgoing / incoming player respectively; `gap` is reset to 0 (it's
 * advisory display only — the engine recomputes it next projection).
 * An out-of-range index returns the array unchanged.
 */
export function applyInlineSwapOverride(
  swaps: SwapSuggestion[],
  pairIndex: number,
  change: { off?: string; on?: string },
): SwapSuggestion[] {
  if (pairIndex < 0 || pairIndex >= swaps.length) return swaps.map((s) => ({ ...s }));
  return swaps.map((s, i) =>
    i === pairIndex
      ? {
          ...s,
          off_player_id: change.off ?? s.off_player_id,
          on_player_id: change.on ?? s.on_player_id,
          gap: 0,
        }
      : { ...s },
  );
}

/** Off/on/zone equality of two swap arrays, order-sensitive. */
export function swapsEqual(
  a: readonly SwapSuggestion[],
  b: readonly SwapSuggestion[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (s, i) =>
      s.off_player_id === b[i].off_player_id &&
      s.on_player_id === b[i].on_player_id &&
      s.zone === b[i].zone,
  );
}

/**
 * Has this pair been overridden away from the engine's auto pick? A
 * pair counts as edited when no auto suggestion matches its exact
 * off/on/zone triple — membership-based so it's robust to the engine
 * re-ordering its picks between renders. Drives the "Edited" badge.
 */
export function isPairEdited(
  pair: SwapSuggestion,
  autoSuggestions: readonly SwapSuggestion[],
): boolean {
  return !autoSuggestions.some(
    (a) =>
      a.off_player_id === pair.off_player_id &&
      a.on_player_id === pair.on_player_id &&
      a.zone === pair.zone,
  );
}

export interface ResolveDisplaySuggestionsInput {
  /** Engine's auto pick for the next sub-due moment (ignores any pin). */
  rawSuggestions: SwapSuggestion[];
  /** True when the next sub-due moment would fall after the hooter. */
  subPastHooter: boolean;
  /** The coach's pinned plan, or null/undefined. */
  pin: PlannedRotation | null | undefined;
  /** 1-indexed current period. */
  currentPeriod: number;
  /** Live lineup (on-field zones + bench). */
  lineup: Lineup;
  /** Players currently injured. */
  injuredIds: readonly string[];
  /** Players currently loaned to the opposition. */
  loanedIds: readonly string[];
}

export interface DisplaySuggestionsResult {
  /** Swaps the SwapCard should render (honoured pin, else engine pick). */
  suggestions: SwapSuggestion[];
  /** A valid pin for THIS period is being honoured. */
  pinnedActive: boolean;
  /**
   * The next sub falls past the hooter AND a pin is active — the card
   * stays visible (it would otherwise be suppressed) so the coach can
   * still apply the pinned sub or let it carry to the break (spec
   * item 6).
   */
  pastHooterCarry: boolean;
}

/**
 * Decide what the SwapCard displays, unifying two concerns the live
 * game previously interleaved inline:
 *
 *   1. Honour a valid pin for this period over the engine pick
 *      (`resolveHonouredSwaps`).
 *   2. Suppress the card when the next sub would fall past the hooter
 *      — UNLESS a pin is active, in which case the pinned sub stays
 *      visible so it isn't silently swallowed (the dead-end found
 *      during investigation; spec item 6).
 *
 * Pure + deterministic. `pinnedActive` is true only when the pin is
 * actually honoured (valid for this period), detected via the
 * reference `resolveHonouredSwaps` returns when every pair is valid.
 */
export function resolveDisplaySuggestions(
  input: ResolveDisplaySuggestionsInput,
): DisplaySuggestionsResult {
  const {
    rawSuggestions,
    subPastHooter,
    pin,
    currentPeriod,
    lineup,
    injuredIds,
    loanedIds,
  } = input;

  const honoured = resolveHonouredSwaps({
    pin,
    currentPeriod,
    lineup,
    injuredIds,
    loanedIds,
    fallback: rawSuggestions,
  });
  // resolveHonouredSwaps returns the pin's own array (by reference)
  // only when the pin is valid for this period — a clean honour check.
  const pinnedActive = !!pin && honoured === pin.pinnedSwaps;

  let suggestions: SwapSuggestion[];
  if (pinnedActive) {
    suggestions = honoured;
  } else if (subPastHooter) {
    suggestions = [];
  } else {
    suggestions = honoured;
  }

  return {
    suggestions,
    pinnedActive,
    pastHooterCarry: pinnedActive && subPastHooter,
  };
}
