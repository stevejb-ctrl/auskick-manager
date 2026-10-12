"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  markLoan,
  saveLineupDraft,
  startGame,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import type { ChipKey, ChipMode } from "@/lib/chips";
import { Field } from "@/components/live/Field";
import { Bench } from "@/components/live/Bench";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import { LineupPickerFooter } from "@/components/lineup/LineupPickerFooter";
import { LineupPickerBreadcrumb } from "@/components/lineup/LineupPickerBreadcrumb";
import { ZoneTimeLegend } from "@/components/live/ZoneTimeLegend";
import {
  Eyebrow,
  SFButton,
  SFIcon,
} from "@/components/sf";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import type { Lineup, Player, PositionModel, Zone } from "@/lib/types";
import {
  suggestStartingLineup,
  zoneCapsFor,
  type PlayerZoneMinutes,
} from "@/lib/fairness";
import { positionsFor, ZONE_SHORT_LABELS } from "@/lib/ageGroups";

import { aflRuleCheck, assignPositionLabels, type AflPlaybookInput } from "@/lib/sports/afl/engine";
import { RuleCheckBar } from "@/components/playbook/RuleCheckBar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useRoleSheet, type RoleSheetConfig } from "@/components/playbook/useRoleSheet";
// Rotations each player gets to sit on the bench over the whole game.
// Bigger benches → more rotations per player (shorter stints each).
function restsPerPlayer(benchSize: number): number {
  return Math.max(1, Math.ceil(benchSize / 2));
}

// Target sub interval (minutes), rounded to the nearest 0.5 min, clamped [1, 10].
function suggestedSubMinutes(
  benchSize: number,
  totalPlayers: number,
  gameMinutes: number,
): number {
  if (benchSize <= 0 || totalPlayers <= 0) return 3;
  const R = restsPerPlayer(benchSize);
  const raw = (benchSize * gameMinutes) / (totalPlayers * R);
  const rounded = Math.round(raw * 2) / 2;
  return Math.min(10, Math.max(1, rounded));
}

interface LineupPickerProps {
  auth: import("@/lib/types").LiveAuth;
  gameId: string;
  players: Player[];
  season: PlayerZoneMinutes;
  defaultOnFieldSize: number;
  minOnFieldSize: number;
  maxOnFieldSize: number;
  positionModel: PositionModel;
  /** Full-game length in minutes (periodCount × quarter length). */
  gameMinutes: number;
  /**
   * Per-game effective full-period length in ms — fed to the suggester's
   * season-diversity threshold so it tracks THIS game's clock rather than a
   * fixed 12 min (CONFIG-01 / D-03). The AFL sports-config mount supplies the
   * EFFECTIVE ms; the legacy share-token mount supplies the age-group default.
   */
  fullPeriodMs: number;
  /** Where "Save plan & exit" returns to (game detail). */
  backHref?: string;
  /** The game's availability page, for the "Update availability" link. */
  availabilityHref?: string;
  /** First-visit tour offer (WalkthroughOffer), shown under the breadcrumb. */
  walkthroughOffer?: React.ReactNode;
  /** Game-day "Who's here" panel, shown under the breadcrumb. */
  availabilityPanel?: React.ReactNode;
  /**
   * Optional pre-game "Game plan" opener, rendered in the shared
   * breadcrumb row above the picker. The server page builds it (it
   * has the team name / opponent / season events) and passes it down
   * so the planner sits in the same spot across all three sports.
   */
  gamePlanButton?: ReactNode;
  /**
   * Pre-game saved lineup. When present, the picker pre-populates
   * with the saved lineup + size + sub-interval instead of running
   * the fairness suggester. Coach can still adjust before kickoff.
   * Cleared at startGame() — the lineup_set event takes over.
   */
  initialDraft?: import("@/lib/types").LineupDraft | null;
  /**
   * Per-chip behaviour (split / group). Drives the suggester so a
   * chip configured as "group" funnels its mates into the same zone
   * (e.g. a player who needs to stay paired with specific teammates),
   * while "split" (default) spreads them across zones.
   */
  chipModeByKey?: Partial<Record<"a" | "b" | "c", ChipMode>>;
  /**
   * How we play (UX plan 3.6): strategy, season balance and player
   * roles for the AFL suggesters. Omitted = today's behaviour.
   */
  aflPlaybook?: AflPlaybookInput;
  /**
   * Player roles (How we play): long-press a player to set their home,
   * also plays, never plays and keep on — the same sheet as the Squad
   * tab (UX plan 3.5). Coaches only; omitted for runners and managers.
   */
  roleSheet?: RoleSheetConfig;
  /**
   * Players already flagged as lent in the pre-game flow. Derived
   * from prior `player_loan` events in this game's event log so the
   * chip survives a page reload. Empty by default for a fresh game.
   * Steve 2026-05-13: "There's no way to set players as lent in the
   * initial team picker." This prop + the Lend panel below address
   * that — toggling here writes the loan event with quarter=1 so it
   * lights up at kickoff.
   */
  initialLoanedIds?: string[];
  /**
   * Default sub interval in MINUTES — the game's configured
   * `sub_interval_seconds` (itself defaulted to the age-group value,
   * e.g. U10 = 3 min). When provided, this is the pre-game default
   * shown in the Sub-interval field, so what the coach sees and saves
   * matches what the live timer fires at. Falls back to the old
   * squad-size heuristic only when omitted (legacy runner-token mount).
   */
  defaultSubMinutes?: number;
}

type Slot = Zone | "bench";

/**
 * Selection model — either a real player by id, or an empty slot
 * targeted by zone. Empty slots within the same zone are
 * interchangeable, so the empty selection is just keyed on the
 * zone, not a specific index.
 */
type Selection =
  | { kind: "player"; id: string }
  | { kind: "empty"; zone: Zone };

/**
 * Lineup picker — coach assigns available players to zones + bench
 * before kick-off. Tap two players to swap them; tap a player and
 * then an empty slot to move that player into a zone.
 *
 * The on-field grid always renders the *default* formation (e.g. for
 * U10 that's 12 slots = 4-4-4 across FWD/CEN/BACK). When the coach
 * lowers "Players on field", some zones run short of their default
 * cap — those slots render as dashed `OPEN` placeholders. Initial
 * placement is fairness-driven via `suggestStartingLineup`, so the
 * empty slots start in zones where the data says you've over-played
 * recently. The coach can then move the empties around by tapping
 * a player followed by the empty slot they want.
 */
export function LineupPicker({
  auth,
  gameId,
  players,
  season,
  defaultOnFieldSize,
  minOnFieldSize,
  maxOnFieldSize,
  positionModel,
  gameMinutes,
  fullPeriodMs,
  backHref,
  availabilityHref,
  walkthroughOffer,
  availabilityPanel,
  gamePlanButton,
  initialDraft,
  chipModeByKey = {},
  aflPlaybook,
  roleSheet,
  initialLoanedIds = [],
  defaultSubMinutes,
}: LineupPickerProps) {
  const router = useRouter();
  // Pre-game loaned-player set. Hydrated from any player_loan events
  // already in the game (e.g. a reload after the coach flagged a
  // loan on a previous visit). Toggle handler below writes the
  // event optimistically.
  const [loanedIds, setLoanedIds] = useState<Set<string>>(
    () => new Set(initialLoanedIds),
  );
  const [lendPickerOpen, setLendPickerOpen] = useState(false);
  const [loanError, setLoanError] = useState<string | null>(null);
  const [loanPending, startLoanTransition] = useTransition();

  // Lineup-facing player list — excludes anyone currently flagged as
  // lent so the suggester won't place them and the bench grid won't
  // show them. `players` (the raw prop) is still used for lookups
  // via playersById below.
  const playersForLineup = useMemo(
    () => players.filter((p) => !loanedIds.has(p.id)),
    [players, loanedIds],
  );
  const lentPlayers = useMemo(
    () => players.filter((p) => loanedIds.has(p.id)),
    [players, loanedIds],
  );

  function handleLendToggle(playerId: string, nextLoaned: boolean) {
    setLoanError(null);
    // Optimistic local update — picker chips reflect the change
    // instantly. Roll back on server error.
    setLoanedIds((prev) => {
      const next = new Set(prev);
      if (nextLoaned) next.add(playerId);
      else next.delete(playerId);
      return next;
    });
    // Also yank the player out of any zone/bench so the lineup grid
    // is consistent with the chip set the suggester sees.
    if (nextLoaned) {
      setLineup((prev) => {
        const next: Lineup = {
          back: prev.back.filter((id) => id !== playerId),
          hback: prev.hback.filter((id) => id !== playerId),
          mid: prev.mid.filter((id) => id !== playerId),
          hfwd: prev.hfwd.filter((id) => id !== playerId),
          fwd: prev.fwd.filter((id) => id !== playerId),
          bench: prev.bench.filter((id) => id !== playerId),
        };
        return next;
      });
    } else {
      // Returning a player → put them back on the bench so the coach
      // can slot them in. Suggester will pick them up next mode-switch.
      setLineup((prev) => ({
        ...prev,
        bench: prev.bench.includes(playerId)
          ? prev.bench
          : [...prev.bench, playerId],
      }));
    }
    startLoanTransition(async () => {
      // Loan applies from the start of Q1. elapsed_ms=0 because the
      // game hasn't started — the event predates quarter_start, and
      // replayGame treats it as "loaned from kickoff".
      const result = await markLoan(auth, gameId, {
        player_id: playerId,
        loaned: nextLoaned,
        quarter: 1,
        elapsed_ms: 0,
      });
      if (!result.success) {
        // Roll back the optimistic update.
        setLoanedIds((prev) => {
          const next = new Set(prev);
          if (nextLoaned) next.delete(playerId);
          else next.add(playerId);
          return next;
        });
        setLoanError(result.error);
      }
    });
  }
  // If the coach saved a plan ahead of game day, those values seed
  // the picker. Otherwise we fall back to the age-group default
  // (size) and the suggester (lineup) at first render.
  const [onFieldSize, setOnFieldSize] = useState(
    initialDraft?.on_field_size ?? defaultOnFieldSize,
  );

  // Lineup-build mode. "suggested" runs the fairness suggester to
  // pre-fill the field (the legacy default — coaches who don't
  // micromanage just accept it). "manual" leaves every position
  // empty and parks all players on the bench so the coach can
  // build the lineup themselves position-by-position. Either mode
  // is fully editable via tap-tap-to-swap; the toggle just decides
  // the starting point.
  const [lineupMode, setLineupMode] = useState<"suggested" | "manual">("suggested");

  // Mirror the local choice into the live store so QuarterBreak
  // picks it up as its default for every subsequent break. Steve's
  // request 2026-05-13: "Change from suggested rotation to manually
  // set (this default would persist across the whole game)."
  const setRotationMode = useLiveGame((s) => s.setRotationMode);

  // Game-settings collapse. Steve 2026-05-13 (follow-up): always
  // start closed. The collapsed-header summary now spells out the
  // active state in plain English ("Suggested lineup · No lent" or
  // "Manual lineup · 1 lent") which makes the discoverability
  // auto-expand was solving unnecessary.
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);

  // displayZoneCaps — always the default formation, used to render the
  // structural grid. Empty slots = displayCap - actual placements.
  const displayZoneCaps = useMemo(
    () => zoneCapsFor(defaultOnFieldSize, positionModel),
    [defaultOnFieldSize, positionModel],
  );

  // Build a lineup for a given mode + on-field size. Suggested →
  // run the fairness suggester. Manual → all players on bench.
  // Uses `playersForLineup` (excludes loaned players) so a lent
  // player won't get auto-placed or appear on the bench grid.
  const buildLineup = (mode: "suggested" | "manual", size: number): Lineup => {
    if (mode === "manual") {
      return {
        back: [],
        hback: [],
        mid: [],
        hfwd: [],
        fwd: [],
        bench: playersForLineup.map((p) => p.id),
      };
    }
    // Build chip-by-id map from the available players list — picked
    // up by the suggester's chip-spread / chip-group penalty (Phase D).
    const chipByPlayerId: Record<string, "a" | "b" | "c" | null | undefined> = {};
    // Cohort chips retired with How we play (UX plan 5.8): their intent now lives in roles and rules.
    return suggestStartingLineup(
      playersForLineup,
      season,
      0,
      zoneCapsFor(size, positionModel),
      {},
      {},
      {},
      {},
      {},
      chipByPlayerId,
      chipModeByKey,
      fullPeriodMs,
      aflPlaybook,
    );
  };

  // The suggester targets `onFieldSize` players via zoneCapsFor —
  // those caps sum to onFieldSize. When onFieldSize < default the
  // resulting zones come up short of displayZoneCaps, and the
  // difference is rendered as empty "OPEN" slots.
  const [lineup, setLineup] = useState<Lineup>(() =>
    initialDraft?.lineup
      ? // Defensive normalise — initialDraft.lineup comes from JSONB.
        {
          back: initialDraft.lineup.back ?? [],
          hback: initialDraft.lineup.hback ?? [],
          mid: initialDraft.lineup.mid ?? [],
          hfwd: initialDraft.lineup.hfwd ?? [],
          fwd: initialDraft.lineup.fwd ?? [],
          bench: initialDraft.lineup.bench ?? [],
        }
      : buildLineup("suggested", defaultOnFieldSize),
  );

  function handleSizeChange(next: number) {
    setOnFieldSize(next);
    setLineup(buildLineup(lineupMode, next));
  }

  function handleModeChange(next: "suggested" | "manual") {
    if (next === lineupMode) return;
    setLineupMode(next);
    setRotationMode(next);
    setLineup(buildLineup(next, onFieldSize));
    setSelected(null);
  }

  const [selected, setSelected] = useState<Selection | null>(null);
  // When the coach taps an empty slot with no player pre-selected,
  // we open a modal sheet listing every bench player so they can
  // place someone in one tap. Null when the sheet is closed.
  const [fillTargetZone, setFillTargetZone] = useState<Zone | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savePending, startSaveTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(
    initialDraft?.updated_at ?? null,
  );
  const [subMinInput, setSubMinInput] = useState<string | null>(
    initialDraft ? String(initialDraft.sub_interval_seconds / 60) : null,
  );

  // Sorted dropdown options. The default size is marked as recommended.
  const sizeOptions = useMemo(() => {
    const out: { value: number; label: string }[] = [];
    for (let s = minOnFieldSize; s <= maxOnFieldSize; s++) {
      const tag =
        s === defaultOnFieldSize
          ? " — recommended"
          : s === defaultOnFieldSize - 1
          ? " — 1 empty position"
          : s < defaultOnFieldSize
          ? ` — ${defaultOnFieldSize - s} empty positions`
          : ` — ${s - defaultOnFieldSize} extra`;
      out.push({ value: s, label: `${s} on field${tag}` });
    }
    return out;
  }, [defaultOnFieldSize, minOnFieldSize, maxOnFieldSize]);

  const playerById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );
  const roles = useRoleSheet(
    roleSheet,
    auth.kind === "team" ? auth.teamId : null,
    (pid) => playerById.get(pid)?.full_name,
  );

  const ruleCheck = useMemo(() => {
    if (!aflPlaybook) return null;
    const names: Record<string, string> = {};
    for (const p of playersForLineup) names[p.id] = p.full_name;
    return aflRuleCheck({
      lineup,
      names,
      gameMinutes: {},
      previousZones: {},
      period: 1,
      periodCount: Math.max(1, Math.round((gameMinutes * 60000) / fullPeriodMs)),
      periodMs: fullPeriodMs,
      season,
      input: aflPlaybook,
    });
  }, [aflPlaybook, playersForLineup, lineup, gameMinutes, fullPeriodMs, season]);

  const zones = useMemo(() => positionsFor(positionModel), [positionModel]);
  // Display order mirrors the in-game field: forwards at the top, backs
  // at the bottom. The underlying `zones` order stays unchanged (fairness
  // + data rely on it) — only the UI grid order is reversed.
  const displayZones = useMemo(() => [...zones].reverse(), [zones]);
  const slots = useMemo<Slot[]>(() => [...displayZones, "bench"], [displayZones]);
  // Does ANYONE in the squad have season zone history? Drives whether
  // the per-player %s + key render at all (UX review #8).
  const anySeasonHistory = useMemo(
    () =>
      players.some((p) => {
        const zm = season[p.id];
        if (!zm) return false;
        return (
          (zm.back ?? 0) + (zm.hback ?? 0) + (zm.mid ?? 0) + (zm.hfwd ?? 0) + (zm.fwd ?? 0) > 0
        );
      }),
    [players, season],
  );
  const slotLabel = (s: Slot) =>
    s === "bench" ? "Bench" : ZONE_SHORT_LABELS[s];

  function slotOf(pid: string): Slot | null {
    for (const s of slots) if (lineup[s].includes(pid)) return s;
    return null;
  }

  /** Move a player to a different zone, filling an empty slot there.
   *  No-op if target has no empty (caller should have checked, but
   *  guard anyway). */
  function movePlayerToZone(pid: string, target: Slot) {
    const source = slotOf(pid);
    if (!source || source === target) return;
    if (target !== "bench" && lineup[target].length >= displayZoneCaps[target]) {
      return;
    }
    setLineup((prev) => ({
      back: prev.back.filter((p) => p !== pid),
      hback: prev.hback.filter((p) => p !== pid),
      mid: prev.mid.filter((p) => p !== pid),
      hfwd: prev.hfwd.filter((p) => p !== pid),
      fwd: prev.fwd.filter((p) => p !== pid),
      bench: prev.bench.filter((p) => p !== pid),
      [target]: [...prev[target], pid],
    }));
  }

  /** Existing two-player swap, lifted out so taps can call into it. */
  function swapPlayers(a: string, b: string) {
    const sa = slotOf(a);
    const sb = slotOf(b);
    if (!sa || !sb) return;
    setLineup((prev) => {
      const next: Lineup = {
        back: [...prev.back],
        hback: [...prev.hback],
        mid: [...prev.mid],
        hfwd: [...prev.hfwd],
        fwd: [...prev.fwd],
        bench: [...prev.bench],
      };
      if (sa === sb) {
        next[sa] = next[sa].map((p) => (p === a ? b : p === b ? a : p));
      } else {
        next[sa] = next[sa].map((p) => (p === a ? b : p));
        next[sb] = next[sb].map((p) => (p === b ? a : p));
      }
      return next;
    });
  }

  function tapPlayer(pid: string) {
    if (!selected) {
      setSelected({ kind: "player", id: pid });
      return;
    }
    if (selected.kind === "player") {
      if (selected.id === pid) {
        setSelected(null); // tap-same = deselect
      } else {
        swapPlayers(selected.id, pid);
        setSelected(null);
      }
      return;
    }
    // empty + player: move the player into the empty zone
    movePlayerToZone(pid, selected.zone);
    setSelected(null);
  }

  function tapEmpty(zone: Zone) {
    // No selection → open the bench-pick sheet so the coach can
    // place someone in one tap (faster than the legacy "tap empty,
    // then tap a bench player" two-step). Coaches who prefer the
    // old flow can still tap a player first; that path is handled
    // below.
    if (!selected) {
      setFillTargetZone(zone);
      return;
    }
    if (selected.kind === "empty") {
      if (selected.zone === zone) {
        setSelected(null);
      } else {
        // empty + empty: re-target the selection to the new zone (UX
        // shortcut — tapping a different empty just moves your aim).
        setSelected({ kind: "empty", zone });
      }
      return;
    }
    // player + empty: move that player into the target zone
    movePlayerToZone(selected.id, zone);
    setSelected(null);
  }

  // Pick handler for the SlotFillSheet — places the chosen player
  // into the slot the sheet was opened for, then closes the sheet.
  function handleFillPick(playerId: string) {
    if (!fillTargetZone) return;
    movePlayerToZone(playerId, fillTargetZone);
    setFillTargetZone(null);
    setSelected(null);
  }

  const onFieldCount = zones.reduce((n, z) => n + lineup[z].length, 0);
  const benchCount = lineup.bench.length;
  const totalCount = onFieldCount + benchCount;
  // Default the sub interval to the game's configured value (age-group
  // default unless the coach changed it) so the pre-game number matches
  // what the live timer fires at. The squad-size heuristic is only a
  // fallback for callers that don't pass a configured interval.
  const suggestedMin =
    defaultSubMinutes ?? suggestedSubMinutes(benchCount, totalCount, gameMinutes);
  const effectiveOnFieldTarget = Math.min(onFieldSize, totalCount);
  const effectiveSubMin =
    subMinInput === null
      ? suggestedMin
      : Math.min(10, Math.max(1, parseFloat(subMinInput) || suggestedMin));

  // Two-step kickoff (Steve 2026-05-13): tapping "Ready for Q1" used
  // to fire startGame immediately, writing lineup_set + flipping
  // status. The LiveGame's StartQuarterModal then asked "Start Q1?"
  // — but "Back to lineup" on that modal was a dead-end (lineup_set
  // already committed, no way back to the editable LineupPicker).
  // Now: Ready opens the modal here, in-place; only Start Q1
  // commits. "Back to lineup" dismisses the modal cleanly with
  // zero server state changed.
  const [startModalOpen, setStartModalOpen] = useState(false);

  // Anchor for walking up the DOM to reset scrolled ancestors before
  // the modal mounts — see handleOpenStartModal for the why.
  const lineupPickerRootRef = useRef<HTMLDivElement>(null);

  function handleOpenStartModal() {
    setServerError(null);
    if (onFieldCount === 0) return;
    // Same scroll-reset as QuarterBreak. The public /run/{token}
    // demo wraps the app in DeviceFrame, whose `translateZ(0)` makes
    // it a containing block for `position: fixed` descendants. With
    // the GM scrolled mid-picker, the modal then renders at the top
    // of the framed area and its primary "Start Q1" button can fall
    // below the visible scroll window. Reset every scrolled ancestor
    // so the modal centres in view. window.scrollTo covers the non-
    // framed (mobile / installed PWA) case.
    if (typeof document !== "undefined") {
      let el = lineupPickerRootRef.current?.parentElement ?? null;
      while (el) {
        if (el.scrollTop > 0) el.scrollTop = 0;
        el = el.parentElement;
      }
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    setStartModalOpen(true);
  }

  function handleConfirmStart() {
    setServerError(null);
    const subSeconds = Math.round(effectiveSubMin * 60);
    startTransition(async () => {
      // startQuarterToo=true → server writes lineup_set AND
      // quarter_start atomically in one round-trip, then redirects
      // (team-auth) or returns success (token-auth). The clock
      // starts via LiveGame's init() auto-resume path on the next
      // mount because quarterStartedAt is now set.
      const result = await startGame(
        auth,
        gameId,
        lineup,
        subSeconds,
        onFieldSize,
        true,
      );
      if (result && !result.success) {
        setServerError(result.error);
        setStartModalOpen(false);
        return;
      }
      if (auth.kind === "token") {
        window.location.assign(`/run/${auth.token}`);
      }
    });
  }

  // Save the current picker state as a pre-game draft. The game
  // stays "upcoming" — no lineup_set event is written. Re-opening
  // the picker will pre-populate from this draft.
  //
  // Steve 2026-05-13: also navigate back to the previous page
  // (backHref) after a successful save. The pre-kickoff sticky
  // bar promotes Save plan to a "save + exit" affordance so the
  // primary "Ready for Q1" CTA can dominate the bar. If no
  // backHref is configured, stay on the page (token-auth runner
  // path).
  function handleSavePlan() {
    setServerError(null);
    const subSeconds = Math.round(effectiveSubMin * 60);
    startSaveTransition(async () => {
      const result = await saveLineupDraft(
        auth,
        gameId,
        lineup,
        subSeconds,
        onFieldSize,
      );
      if (!result.success) {
        setServerError(result.error);
        return;
      }
      setSavedAt(new Date().toISOString());
      if (backHref) router.push(backHref);
    });
  }

  // Season time in zone, in ms for the field tiles' zone bars.
  const seasonMsByPlayer = useMemo(() => {
    const out: Record<string, (typeof season)[string]> = {};
    for (const [pid, z] of Object.entries(season)) {
      out[pid] = {
        back: z.back * 60_000,
        hback: z.hback * 60_000,
        mid: z.mid * 60_000,
        hfwd: z.hfwd * 60_000,
        fwd: z.fwd * 60_000,
      };
    }
    return out;
  }, [season]);

  const playingShortHanded = onFieldSize < defaultOnFieldSize;

  return (
    // Footer is `position: sticky` so it occupies real flow space —
    // no bottom-padding workaround needed. Prior `pb-[calc(8rem+…)]`
    // pushed the parent's bottom edge so far below the sticky
    // element that sticky released its pin partway down the scroll
    // (Steve 2026-05-20 demo fix).
    <div
      ref={lineupPickerRootRef}
      role="region"
      aria-label="Starting lineup"
      className="space-y-4"
    >
      <LineupPickerBreadcrumb availabilityHref={availabilityHref} action={gamePlanButton} />
      {availabilityPanel}
      {walkthroughOffer}

      {/* Lent players — always-visible recall strip so a coach can shuffle
          lent players straight from the picker (recall was previously only
          reachable inside the Game settings collapse). "Bring back" returns
          them to the bench, ready to place. */}
      {lentPlayers.length > 0 && (
        <div className="rounded-lg border border-warn/40 bg-warn-soft/60 px-3 py-2">
          <p className="text-xs font-semibold text-warn">Lent to the other team</p>
          <p className="mt-0.5 text-[11px] text-warn/80">
            Tap “Bring back” to return a player to your bench.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {lentPlayers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleLendToggle(p.id, false)}
                disabled={loanPending}
                data-testid={`picker-recall-lent-${p.id}`}
                aria-label={`Bring ${p.full_name} back`}
                className="inline-flex items-center gap-1 rounded-full border border-warn/50 bg-surface px-2.5 py-1 text-xs font-medium text-warn transition-colors hover:bg-warn/15 disabled:opacity-60 motion-safe:active:scale-[0.97]"
              >
                {p.jersey_number != null && (
                  <span className="tabular-nums font-semibold">{p.jersey_number}</span>
                )}
                <span>{p.full_name}</span>
                <span className="ml-0.5 text-[11px] font-semibold text-warn/80">
                  Bring back
                </span>
              </button>
            ))}
          </div>
          {loanError && (
            <p className="mt-1 text-xs text-danger" role="alert">
              {loanError}
            </p>
          )}
        </div>
      )}

      {/* ── Game settings (collapsible) ──────────────────────────────────
          Steve 2026-05-13: the three pre-game controls (rotation
          mode, on-field size, lend a player) used to each occupy
          their own row at the top of the picker, but for most games
          they all sit at their defaults. Group them behind a single
          collapsible "Game settings" header so the noise drops away
          when nothing's been changed. The collapsed header shows a
          one-line summary of any non-defaults so the coach knows
          something IS set without having to expand. Mirrors the
          Match-adjustments collapse on QuarterBreak. */}
      <div className="rounded-md border border-hairline bg-surface shadow-card">
        <button
          type="button"
          onClick={() => setGameSettingsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
          aria-expanded={gameSettingsOpen}
          aria-controls="lineup-game-settings"
        >
          <span className="flex flex-1 items-center gap-3 text-sm">
            <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
              Game settings
            </span>
            <span className="text-xs text-ink-mute">
              {(() => {
                // Summary line — always show rotation mode AND a
                // lent chip ("1 lent" / "No lent") so the closed
                // header doubles as a discovery hint for what's
                // inside the collapse. Size still only surfaces
                // when non-default (numeric value, "No" framing
                // doesn't fit). Mirrors the QB collapse. No
                // injured concept pre-game — the squad hasn't
                // hit the field yet.
                const bits: string[] = [];
                bits.push(
                  lineupMode === "suggested" ? "Suggested lineup" : "Manual lineup",
                );
                if (onFieldSize !== defaultOnFieldSize)
                  bits.push(`${onFieldSize} on field`);
                // Sub interval always shows the EFFECTIVE value
                // (override if the coach typed one, otherwise the
                // live suggestion). Steve 2026-05-20 — unlike
                // Players-on-field, the sub-interval number is
                // meaningful even when at default ("sub every
                // 3m" tells a real story; "12 on field" doesn't).
                // Showing it unconditionally means the coach can
                // scan the closed header and know exactly how
                // their game's pacing is set up.
                bits.push(`Sub every ${effectiveSubMin}m`);
                bits.push(
                  lentPlayers.length > 0
                    ? `${lentPlayers.length} lent`
                    : "No lent",
                );
                return bits.join(" · ");
              })()}
            </span>
          </span>
          <span aria-hidden className="text-ink-mute">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className={`transition-transform duration-fast ease-out-quart ${
                gameSettingsOpen ? "rotate-180" : ""
              }`}
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>

        {gameSettingsOpen && (
          <div
            id="lineup-game-settings"
            className="space-y-4 border-t border-hairline px-4 py-4"
          >
            {/* Rotation mode */}
            <div>
              <p className="text-xs font-semibold text-ink">Rotation</p>
              <SegmentedControl
                className="mt-2"
                label="Rotation"
                disabled={isPending}
                value={lineupMode}
                options={[
                  { id: "suggested", label: "Suggested" },
                  { id: "manual", label: "Set manually" },
                ]}
                onChange={(next) => handleModeChange(next)}
              />
              <p className="mt-1.5 text-xs text-ink-mute">
                {lineupMode === "suggested"
                  ? "Auto-rotates each quarter — players with less season zone time start."
                  : "Blank field at kickoff. This choice persists through the whole game; QuarterBreak respects it too."}
              </p>
            </div>

            {/* Players on field */}
            <div>
              <Label
                htmlFor="on-field-size"
                className="!mb-1 block text-xs font-semibold text-ink"
              >
                Players on field
              </Label>
              <select
                id="on-field-size"
                value={onFieldSize}
                disabled={isPending}
                onChange={(e) => handleSizeChange(parseInt(e.target.value, 10))}
                className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-surface-alt disabled:text-ink-mute"
              >
                {sizeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {playingShortHanded && (
                <p className="mt-1.5 text-xs text-ink-mute">
                  Empty positions show as dashed slots in each zone — tap an
                  empty slot first to choose where you&apos;re short.
                </p>
              )}
            </div>

            {/* Sub interval — Steve 2026-05-17: moved up from a
                standalone card below the zone grid into the Game
                settings collapse, alongside Rotation + Players on
                field. All pre-game match-shape knobs now live in
                one place. The suggested value is dynamic (recomputes
                from bench size + game length), so the helper line
                still surfaces it in the explainer below the input. */}
            <div>
              <Label
                htmlFor="sub-minutes"
                className="!mb-1 block text-xs font-semibold text-ink"
              >
                Sub interval
              </Label>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <p className="text-xs text-ink-mute">
                    Suggested {suggestedMin} min — {benchCount} on bench,{" "}
                    {totalCount} total, ≈{restsPerPlayer(benchCount)} rest
                    {restsPerPlayer(benchCount) === 1 ? "" : "s"} each over{" "}
                    {gameMinutes} min.
                  </p>
                </div>
                <div className="w-24">
                  <Input
                    id="sub-minutes"
                    type="number"
                    min={1}
                    max={10}
                    step={0.5}
                    value={subMinInput ?? String(suggestedMin)}
                    onChange={(e) => setSubMinInput(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>
            </div>

            {/* Lend a player */}
            <div>
              <p className="text-xs font-semibold text-ink">Lend a player</p>
              <p className="mt-0.5 text-xs text-ink-mute">
                Lent players sit out for the rest of the game until you
                bring them back.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {lentPlayers.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full border border-warn/50 bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn"
                  >
                    {p.jersey_number != null && (
                      <span className="tabular-nums font-semibold">
                        {p.jersey_number}
                      </span>
                    )}
                    <span>{p.full_name}</span>
                    <button
                      type="button"
                      onClick={() => handleLendToggle(p.id, false)}
                      disabled={loanPending}
                      aria-label={`Bring ${p.full_name} back`}
                      className="ml-0.5 rounded-full px-1 text-[11px] font-bold leading-none text-warn/80 hover:bg-warn/15 hover:text-warn disabled:opacity-60 motion-safe:active:scale-[0.97]"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setLendPickerOpen(true)}
                  disabled={loanPending}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors hover:border-brand-500/40 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60 motion-safe:active:scale-[0.97]"
                >
                  <span aria-hidden>+</span>
                  Lend a player
                </button>
              </div>
              {loanError && (
                <p className="mt-1 text-xs text-danger" role="alert">
                  {loanError}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Short on-field hint (always visible — it's a kickoff-day
          consideration the coach needs to see regardless of whether
          Game settings is open). */}
      {onFieldCount < effectiveOnFieldTarget && (
        <p className="text-xs leading-relaxed text-ink-dim">
          Only {onFieldCount} on field — add late arrivals after kick-off.
        </p>
      )}

      {/* Lend-player picker modal — opens from "+ Lend a player". Lists
          every available squad player not already lent. */}
      {lendPickerOpen && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Lend"
          subtitle="Pick a player to lend to the opposition for the rest of the game. Tap their chip to bring them back."
          emptyMessage="Everyone is already lent."
          candidates={players
            .filter((p) => !loanedIds.has(p.id))
            .map((p) => ({
              id: p.id,
              name: p.full_name,
              jerseyNumber: p.jersey_number,
            }))}
          onPick={(pid) => {
            handleLendToggle(pid, true);
            setLendPickerOpen(false);
          }}
          onCancel={() => setLendPickerOpen(false)}
        />
      )}

      {/* ── Zone + bench cards ───────────────────────────────────────── */}
      {/* Key for the season time-in-zone %s under each player — helps
          a coach placing the lineup by hand spot who's had least of a
          zone and start them there. Steve 2026-07-07. On a squad with
          NO history yet (fresh team), the key + 13 identical per-row
          "No season time yet" lines were pure noise — collapse to one
          note instead (UX review #8, Steve 2026-07-08). */}
      {anySeasonHistory ? (
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-medium text-ink-dim">
            Season time in zone
          </span>
          <ZoneTimeLegend
            items={[
              { label: "Fwd", swatchClassName: "bg-zone-f", textClassName: "text-zone-f" },
              { label: "Centre", swatchClassName: "bg-zone-c", textClassName: "text-zone-c" },
              { label: "Back", swatchClassName: "bg-zone-b", textClassName: "text-zone-b" },
            ]}
          />
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-hairline bg-surface-alt px-3 py-2 text-[11px] text-ink-mute">
          Zone history appears under each player after your first game.
        </p>
      )}

      {/* Rule check (UX plan 4.3): the team's rules, the game-time
          floor and season balance against this lineup. */}
      {ruleCheck && <RuleCheckBar items={ruleCheck.items} />}

      {/* The same field the live game uses (UX plan principle 2: one
          lineup, one picture). Tap a player then another to swap them
          — across zones or with the bench; tap a player then an empty
          spot to move them; tap an empty spot first to pick from the
          bench. The zone bar on each tile is season time in zone. */}
      <div className="space-y-3">
        <Field
          playersById={playerById}
          lineup={lineup}
          selectedPlayerId={selected?.kind === "player" ? selected.id : null}
          primedEmptyZone={selected?.kind === "empty" ? selected.zone : null}
          dimUnselected={false}
          onTapField={(pid, zone) => (pid ? tapPlayer(pid) : tapEmpty(zone))}
          onLongPress={roles.open}
          zoneMsByPlayer={seasonMsByPlayer}
          zoneCaps={displayZoneCaps}
          displayZoneCaps={displayZoneCaps}
          positionModel={positionModel}
          chipModeByKey={chipModeByKey}
          positionLabels={assignPositionLabels(lineup, aflPlaybook)}
        />
        <Bench
          playersById={playerById}
          lineup={lineup}
          selectedPlayerId={selected?.kind === "player" ? selected.id : null}
          dimUnselected={false}
          onTapBench={tapPlayer}
          onLongPress={roles.open}
          zoneMsByPlayer={seasonMsByPlayer}
          chipModeByKey={chipModeByKey}
        />
        {roles.sheet}
      </div>

      {/* Sub interval input moved UP into the Game settings
          collapse (Steve 2026-05-17) so all pre-game match-shape
          knobs sit in one place. Empty here intentionally —
          keeping the spot for grep so a future audit doesn't re-
          introduce the card. */}

      {serverError && (
        <p className="text-sm text-danger" role="alert">
          {serverError}
        </p>
      )}

      {/* Sticky pre-game footer — chrome owned by the shared
          LineupPickerFooter (P3a, netball-parity extraction). The
          two-row layout (counts + Save-plan + Ready CTA) renders
          when onSavePlan is provided; token-auth runners pass
          undefined to collapse to a single-row Ready-only footer
          (Lisa B4 usability fix — "Save plan & exit" next to
          "Ready" reads as ambiguous in the runner flow). */}
      <LineupPickerFooter
        onFieldCount={onFieldCount}
        benchCount={benchCount}
        onSavePlan={auth.kind === "team" ? handleSavePlan : undefined}
        savePending={savePending}
        savedAt={savedAt}
        savePlanDisabled={onFieldCount === 0 || isPending}
        onConfirm={handleOpenStartModal}
        confirmLabel="Start Q1"
        confirmDisabled={onFieldCount === 0 || isPending}
        confirmIconAfter={<SFIcon.chevronRight color="currentColor" />}
      />

      {/* Await-kickoff modal — owned by LineupPicker (Steve
          2026-05-13). Renders only after the coach has confirmed
          their lineup with "Ready for Q1". The modal's "Start Q1"
          handler runs the actual server commit (lineup_set +
          quarter_start atomically via startGame's
          startQuarterToo=true flag). "Back to lineup" just closes
          the modal — zero server writes, the picker is still
          editable in the background. */}
      {startModalOpen && (
        <StartQuarterModal
          quarter={1}
          loading={isPending}
          onStart={handleConfirmStart}
          onCancel={() => setStartModalOpen(false)}
        />
      )}

      {/* Empty-slot picker sheet — opens when the coach taps an
          unfilled position with no player pre-selected. Lists every
          bench player so the coach can place someone in one tap. */}
      {fillTargetZone && (
        <SlotFillSheet
          slotLabel={ZONE_SHORT_LABELS[fillTargetZone]}
          candidates={lineup.bench
            .map((pid) => playerById.get(pid))
            .filter((p): p is Player => !!p)
            .map((p) => ({
              id: p.id,
              name: p.full_name,
              jerseyNumber: p.jersey_number,
            }))}
          onPick={handleFillPick}
          onCancel={() => setFillTargetZone(null)}
        />
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

