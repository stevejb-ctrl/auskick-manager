"use client";

import { useRouter } from "next/navigation";
import { startTransition as reactStartTransition, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { RotationModeToggle, type RotationMode } from "@/components/quarter-break/RotationModeToggle";
import { rotateLines } from "@/lib/live/rotateLines";
import { QuarterKickoffBar } from "@/components/quarter-break/QuarterKickoffBar";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import {
  InjuryReplacementModal,
  type InjuryReplacementCandidate,
} from "@/components/live/InjuryReplacementModal";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { Guernsey, SFButton } from "@/components/sf";
import {
  markInjury,
  markLoan,
  recordLineupSet,
  setOnFieldSize as setOnFieldSizeAction,
  startQuarter as startQuarterAction,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { CHIP_COLORS, type ChipKey, type ChipMode } from "@/lib/chips";
import { ZoneTimeLegend } from "@/components/live/ZoneTimeLegend";
import {
  ALL_ZONES,
  deriveEffectiveZoneCaps,
  suggestStartingLineup,
  zoneCapsFor,
  zoneTeammatesFromLineup,
  type PlayerZoneMinutes,
  type SeasonAvailability,
  type ZoneCaps,
  type ZoneMinutes,
} from "@/lib/fairness";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { hapticTap } from "@/lib/haptics";
import {
  emptyLineup,
  type Lineup,
  type Player,
  type PositionModel,
  type Zone,
} from "@/lib/types";
import { positionsFor, ZONE_SHORT_LABELS } from "@/lib/ageGroups";
import { QuarterScoreTable } from "@/components/live/QuarterScoreTable";
import { ScoreReviewPanel } from "@/components/live/ScoreReviewPanel";
import { consumePeriodPin, seedNextPeriodLineup } from "@/lib/game-plan";
import {
  benchPlayerInLineup,
  benchSidelinedInLineup,
  replaceInLineup,
} from "@/lib/live/lineupOps";
import { useStagedBreakDraft } from "@/lib/live/useStagedBreakDraft";
import { Modal } from "@/components/ui/Modal";
import { PlayerInsightSummary } from "@/components/live/PlayerInsightSummary";
import { breakInsightInput } from "@/lib/player-insight";
import { getSportConfig } from "@/lib/sports/registry";
import { Field, ZONE_SHORT } from "@/components/live/Field";
import { Bench } from "@/components/live/Bench";
import type { TileCaption } from "@/components/live/PlayerTile";

import { aflRuleCheck, assignPositionLabels, type AflPlaybookInput } from "@/lib/sports/afl/engine";
import { RuleCheckBar } from "@/components/playbook/RuleCheckBar";
// Players who came on shortly before the quarter break — keep them in their
// zone rather than moving them again immediately.
const RECENT_ARRIVAL_MS = 3 * 60 * 1000; // 3 minutes


interface QuarterBreakProps {
  auth: import("@/lib/types").LiveAuth;
  gameId: string;
  players: Player[];
  season: PlayerZoneMinutes;
  /**
   * Per-player played-vs-available quarter counts across PRIOR
   * games. Drives the suggester's tiebreak so an under-utilised
   * regular climbs the queue ahead of a teammate with similar
   * in-game minutes today.
   */
  seasonAvailability: Record<string, SeasonAvailability>;
  zoneCaps: ZoneCaps;
  positionModel: PositionModel;
  /** Current persisted on-field size — drives the size dropdown. */
  currentOnFieldSize: number;
  /** Sport+age legal range for the on-field size dropdown. */
  minOnFieldSize: number;
  maxOnFieldSize: number;
  /** Default on-field size for the team's age group (shown as a hint). */
  defaultOnFieldSize: number;
  /**
   * Per-game effective full-period length in ms — fed to the suggester's
   * season-diversity threshold so it tracks THIS game's clock rather than a
   * fixed 12 min (CONFIG-01 / D-03). LiveGame supplies its `quarterMs`.
   */
  fullPeriodMs: number;
  /** Per-chip mode (split / group) — drives the suggester's chip cost. */
  chipModeByKey?: Partial<Record<"a" | "b" | "c", ChipMode>>;
  /** Periods in a game (4 quarters / 2 halves), for the rule check. */
  periodCount?: number;
  /**
   * How we play (UX plan 3.6): strategy, season balance and player
   * roles for the AFL suggesters. Omitted = today's behaviour.
   */
  aflPlaybook?: AflPlaybookInput;
  onStarted: () => void;
  /**
   * Fired SYNCHRONOUSLY when the coach taps Start (issue 1) — before the
   * async lineup/quarter writes — so the host can unlock audio inside the
   * user gesture (browsers only honour programmatic playback that
   * descends from a real gesture). AFL passes `primeSong`; optional so
   * other sports can omit it.
   */
  onPrimeAudio?: () => void;
}

type Slot = Zone | "bench";

function emptyZM(): ZoneMinutes {
  return { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
}

export function QuarterBreak({
  auth,
  gameId,
  players,
  season,
  seasonAvailability,
  positionModel,
  currentOnFieldSize,
  minOnFieldSize,
  maxOnFieldSize,
  defaultOnFieldSize,
  fullPeriodMs,
  chipModeByKey = {},
  aflPlaybook,
  periodCount = 4,
  onStarted,
  onPrimeAudio,
}: QuarterBreakProps) {
  const lineup = useLiveGame((s) => s.lineup);
  // Display caps for the zone-card headers + "+ Add player"
  // affordance — based on the age-group DEFAULT, not the
  // currently-chosen on-field size. When the coach has reduced
  // count below default (e.g. 15→13), the zone header still
  // reads `3 / 5` rather than `3 / 4` so the missing slots are
  // visible, and the + Add row stays surfaced until the zone is
  // at default capacity. `effectiveZoneCaps` (below) is the source
  // of truth for the suggester / placement loop. Steve 2026-05-20.
  const displayZoneCaps = useMemo(
    () => zoneCapsFor(defaultOnFieldSize, positionModel),
    [defaultOnFieldSize, positionModel],
  );

  const currentQuarter = useLiveGame((s) => s.currentQuarter);
  // Steve 2026-05-16: parity with netball Q-break, which has been
  // surfacing a per-player goal-count badge on its tiles since the
  // initial netball ship. Pulled from the live store's
  // `playerScores` (kept in sync with goal/behind events). Coaches
  // do care who's been scoring during a break — netball already
  // earned this affordance, AFL was lagging.
  const playerScores = useLiveGame((s) => s.playerScores);
  const setLineup = useLiveGame((s) => s.setLineup);
  // Started locally inside handleConfirmStart so the clock kicks off
  // the moment the modal Start tap commits — without it, the LiveGame
  // mount after refresh would land with clockStartedAt=null (because
  // beginNextQuarter resets it) and there's no longer a LiveGame
  // modal to bridge the gap (the dedicated modal was removed when
  // the kickoff commit moved here). Steve 2026-05-13.
  const startClock = useLiveGame((s) => s.startClock);
  const basePlayedZoneMs = useLiveGame((s) => s.basePlayedZoneMs);
  // pastQuarterZones is still populated by replayGame + the store
  // (kept in state so the suggester or a future per-quarter view
  // can read it) but the QB tile dropped its per-quarter bar in
  // favour of the time-in-zone proportional bar Steve asked for
  // 2026-05-13. No JSX consumer in this file.
  const lastStintMs = useLiveGame((s) => s.lastStintMs);
  const lastStintZone = useLiveGame((s) => s.lastStintZone);
  const lockedIds = useLiveGame((s) => s.lockedIds);
  const zoneLockedPlayers = useLiveGame((s) => s.zoneLockedPlayers);
  const injuredIds = useLiveGame((s) => s.injuredIds);
  const loanedIds = useLiveGame((s) => s.loanedIds);
  const setLoaned = useLiveGame((s) => s.setLoaned);
  const setInjured = useLiveGame((s) => s.setInjured);
  const addBenchPlayer = useLiveGame((s) => s.addBenchPlayer);
  // F2 plan-ahead (ROTPLAN-02): the coach may have pinned THIS upcoming
  // period's lineup during the dying minutes of the last one. Read the
  // pin so the break can open PRE-SEEDED on it (D-12), and the clearer
  // so we can consume it once the next period starts (D-14).
  const plannedRotation = useLiveGame((s) => s.plannedRotation);
  const setPlannedRotation = useLiveGame((s) => s.setPlannedRotation);
  const sidelinedSet = useMemo(
    () => new Set<string>([...injuredIds, ...loanedIds]),
    [injuredIds, loanedIds]
  );
  const injuredSet = useMemo(() => new Set(injuredIds), [injuredIds]);
  const loanedSet = useMemo(() => new Set(loanedIds), [loanedIds]);

  const zones = useMemo(() => positionsFor(positionModel), [positionModel]);
  // Labelled zones (config-derived, age-group filtered) for the shared
  // PlayerInsightSummary — same derivation the in-game LockModal uses.
  const insightZones = useMemo(
    () =>
      getSportConfig("afl").zones.filter((z) =>
        (zones as readonly string[]).includes(z.id),
      ),
    [zones],
  );
  // ─── Long-press → player insight + injury toggle (issues 8 & 9) ──
  // Mirror the in-game long-press: hold a tile to open the SAME stats
  // sheet (PlayerInsightSummary) plus mark-injured / mark-available.
  // The field tiles own the gesture (PlayerTile's useLongPress).
  const [insightPlayerId, setInsightPlayerId] = useState<string | null>(null);
  // Display FWD → CENTRE → BACK (top → bottom) to match the coach's field mental model.
  const slots = useMemo<Slot[]>(() => [[...zones].reverse(), "bench"].flat() as Slot[], [zones]);
  const slotLabel = (s: Slot) => {
    if (s === "bench") return "Bench";
    if (s === "mid") return "Centre";
    // Steve 2026-05-13: spell FWD out as Forward. Matches the
    // "Centre" treatment for mid above so the on-page labels read
    // as full words rather than abbreviations.
    if (s === "fwd") return "Forward";
    return ZONE_SHORT_LABELS[s];
  };

  const currentGameZoneMins = useMemo(() => {
    const out: PlayerZoneMinutes = {};
    for (const [pid, zm] of Object.entries(basePlayedZoneMs)) {
      const next = emptyZM();
      for (const z of ALL_ZONES) next[z] = zm[z] / 60000;
      out[pid] = next;
    }
    return out;
  }, [basePlayedZoneMs]);

  const combinedZoneMins = useMemo(() => {
    const out: PlayerZoneMinutes = {};
    for (const [pid, zm] of Object.entries(season)) {
      const next = emptyZM();
      for (const z of ALL_ZONES) next[z] = zm[z];
      out[pid] = next;
    }
    for (const [pid, zm] of Object.entries(currentGameZoneMins)) {
      out[pid] ??= emptyZM();
      for (const z of ALL_ZONES) out[pid][z] += zm[z];
    }
    return out;
  }, [season, currentGameZoneMins]);

  const [draft, setDraft] = useState<Lineup>(lineup);

  // Field tiles: this game's minutes so far.
  const gameTotalMs = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [pid, zm] of Object.entries(basePlayedZoneMs)) {
      out[pid] = ALL_ZONES.reduce((a, z) => a + zm[z], 0);
    }
    return out;
  }, [basePlayedZoneMs]);

  const [selected, setSelected] = useState<string | null>(null);
  // A kid lent, hurt or marked out stops being selected (the next tap
  // would swap them on).
  useEffect(() => {
    if (selected && sidelinedSet.has(selected)) setSelected(null);
  }, [selected, sidelinedSet]);
  // Slot the coach is filling via the SlotFillSheet. Set when they
  // tap an empty zone slot; cleared when they pick or cancel. Null
  // means the sheet is closed.
  const [fillTargetZone, setFillTargetZone] = useState<Zone | null>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Q-break lineup-build mode:
  //   "suggested" — auto-rebalance via the fairness suggester (default).
  //   "keep"      — carry last quarter's lineup through unchanged.
  //   "manual"    — wipe to a blank field, all players on bench, coach
  //                 builds the next quarter from scratch.
  // All three are fully editable via tap-tap below; the toggle just
  // sets the starting state when the coach lands on the Q-break.
  // Initial value defers to the live store's rotationMode (set by
  // the pre-game LineupPicker) so a coach who picked "Set manually"
  // pre-game sees Manual at every QB instead of having to re-pick
  // each break. Map to QB's three modes: store "manual" → "manual",
  // store "suggested" → "suggested" (no "keep" mapping — keep is a
  // per-Q decision the coach makes at each break, not a persistent
  // default).
  const persistedRotationMode = useLiveGame((s) => s.rotationMode);
  const setPersistedRotationMode = useLiveGame((s) => s.setRotationMode);
  const [lineupMode, setLineupMode] = useState<RotationMode>(
    persistedRotationMode === "manual"
      ? "manual"
      : persistedRotationMode === "rotate"
        ? "rotate"
        : "suggested",
  );

  const playersById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );

  const breakRuleCheck = useMemo(() => {
    if (!aflPlaybook) return null;
    const names: Record<string, string> = {};
    for (const p of players) names[p.id] = p.full_name;
    return aflRuleCheck({
      lineup: draft,
      names,
      gameMinutes: currentGameZoneMins,
      previousZones: lastStintZone,
      period: currentQuarter + 1,
      periodCount,
      periodMs: fullPeriodMs,
      season,
      input: aflPlaybook,
    });
  }, [aflPlaybook, players, draft, currentGameZoneMins, lastStintZone, currentQuarter, periodCount, fullPeriodMs, season]);
  const availableForLineup = useMemo(() => {
    const all: string[] = [...lineup.bench];
    for (const z of ALL_ZONES) all.push(...lineup[z]);
    return all
      .map((id) => playersById.get(id))
      .filter((p): p is Player => !!p);
  }, [lineup, playersById]);
  // Injured / loaned players stay parked on the bench — never fed to the
  // reshuffler, never rotated onto the field at quarter breaks.
  const healthyForLineup = useMemo(
    () => availableForLineup.filter((p) => !sidelinedSet.has(p.id)),
    [availableForLineup, sidelinedSet]
  );
  const sidelinedIdsInLineup = useMemo(
    () => availableForLineup.filter((p) => sidelinedSet.has(p.id)).map((p) => p.id),
    [availableForLineup, sidelinedSet]
  );

  // Effective suggester caps preserve the previous quarter's zone shape.
  // Two failure modes this fixes:
  //   1. Coach's manual blank-in-a-zone choice (same on-field count) —
  //      the original 2026-05-23 fix.
  //   2. SHORT SQUAD: fewer available players than the configured
  //      on-field size (e.g. 10 kids in a 12-slot U10 game running
  //      3/4/3). Here the effective size is the healthy-player count, so
  //      `deriveEffectiveZoneCaps` preserves the coach's split instead of
  //      re-padding to the age-group default 4/4/4 every break. Without
  //      the `min`, the previous 3/4/3 (=10) never equalled 12 and always
  //      fell back to the default. Steve 2026-07-07 match-day bug.
  //
  //   3. SIDELINED ≠ SHORT SQUAD (Steve 2026-08-16 match-day bug). Marking a
  //      player out at 3/4 time dropped the healthy count below the configured
  //      size, so the coach's 4/4/4 (=12) no longer matched and the caps fell
  //      back to the default for 11 — the formation re-solved, players were
  //      crammed forward and couldn't be moved. The coach's SHAPE must survive
  //      a mid-game injury: keep the configured size so the missing player
  //      simply leaves an empty slot. Only shrink when the squad itself is
  //      short — i.e. fewer players are IN THE GAME at all (case 2 above) than
  //      the configured size — which is what `availableForLineup` measures.
  const effectiveOnFieldSize = Math.min(
    currentOnFieldSize,
    availableForLineup.length,
  );
  const effectiveZoneCaps = useMemo<ZoneCaps>(
    () =>
      deriveEffectiveZoneCaps(
        lineup,
        effectiveOnFieldSize,
        positionModel,
        zoneCapsFor(effectiveOnFieldSize, positionModel),
      ),
    [lineup, effectiveOnFieldSize, positionModel],
  );

  const nextQuarter = currentQuarter + 1;

  // ─── F2 plan-ahead pre-seed (ROTPLAN-02 / D-12, D-13) ──────────────
  // 0-based index of the period THIS break leads into (nextQuarter is
  // 1-based). The pin's `nextPeriodIndex` must match for the seed to
  // apply — a wrong-period (or wrong-game) pin yields no seed and the
  // break falls back to its own suggestion.
  const upcomingPeriodIndex = nextQuarter - 1;
  const seededDraft = useMemo<Lineup | null>(() => {
    const seed = seedNextPeriodLineup({
      pin:
        plannedRotation && plannedRotation.gameId === gameId
          ? plannedRotation
          : null,
      periodIndex: upcomingPeriodIndex,
      // Only currently-available players may be fielded — a pinned player
      // who is now injured/loaned/out is reconciled OUT (D-13).
      availableIds: healthyForLineup.map((p) => p.id),
      groupIds: zones,
    });
    if (!seed) return null;
    // Convert the sport-neutral seed into an AFL Lineup. Any healthy
    // player the pin didn't place (e.g. a late arrival added after the
    // pin) lands on the bench so nobody is lost; sidelined players stay
    // parked on the bench as everywhere else.
    const placed = new Set(Object.values(seed.groups).flat());
    const onBench = new Set(seed.bench);
    const extraBench = healthyForLineup
      .map((p) => p.id)
      .filter((id) => !placed.has(id) && !onBench.has(id));
    return {
      back: seed.groups.back ?? [],
      hback: seed.groups.hback ?? [],
      mid: seed.groups.mid ?? [],
      hfwd: seed.groups.hfwd ?? [],
      fwd: seed.groups.fwd ?? [],
      bench: [...seed.bench, ...extraBench, ...sidelinedIdsInLineup],
    };
  }, [
    plannedRotation,
    gameId,
    upcomingPeriodIndex,
    healthyForLineup,
    zones,
    sidelinedIdsInLineup,
  ]);
  const hasPlannedSeed = seededDraft !== null;

  function slotOf(pid: string, l: Lineup): Slot | null {
    for (const s of slots) if (l[s].includes(pid)) return s;
    return null;
  }

  function handleTap(pid: string) {
    // Injured / loaned players are parked on the bench; tapping them is
    // a no-op so a coach can't manually drag them onto the field.
    if (sidelinedSet.has(pid)) return;
    // Nor can a kid selected before they were lent, hurt or marked out
    // (they'd swap on with this tap): this tap starts a new selection.
    const current = selected && !sidelinedSet.has(selected) ? selected : null;
    if (!current) {
      setSelected(pid);
      return;
    }
    if (current === pid) {
      setSelected(null);
      return;
    }
    const a = current;
    const b = pid;
    setDraft((prev) => {
      const sa = slotOf(a, prev);
      const sb = slotOf(b, prev);
      if (!sa || !sb) return prev;
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
    setSelected(null);
  }

  // Move a bench player into a target zone — shared between the
  // SlotFillSheet pick path and any future direct-place affordances.
  // Pulls the player out of wherever they currently live (zone or
  // bench) so we don't double-count.
  function placeInZone(pid: string, target: Zone) {
    setDraft((prev) => ({
      back: prev.back.filter((p) => p !== pid),
      hback: prev.hback.filter((p) => p !== pid),
      mid: prev.mid.filter((p) => p !== pid),
      hfwd: prev.hfwd.filter((p) => p !== pid),
      fwd: prev.fwd.filter((p) => p !== pid),
      bench: prev.bench.filter((p) => p !== pid),
      [target]: [...prev[target], pid],
    }));
  }

  function handleFillPick(playerId: string) {
    if (!fillTargetZone) return;
    placeInZone(playerId, fillTargetZone);
    setFillTargetZone(null);
    setSelected(null);
  }

  // Tile captions: where each player goes for the next quarter,
  // against the lineup that finished this one.
  const captionSlot = (s: Slot) => (s === "bench" ? "Bench" : ZONE_SHORT[s]);
  const breakCaptions: Record<string, TileCaption> = {};
  for (const s of slots) {
    for (const pid of draft[s]) {
      if (sidelinedSet.has(pid)) {
        breakCaptions[pid] = { text: "Unavailable", tone: "stay" };
        continue;
      }
      const prev = slotOf(pid, lineup);
      if (!prev) continue;
      breakCaptions[pid] =
        prev === s
          ? { text: "Stays", tone: "stay" }
          : { text: `${captionSlot(prev)} → ${captionSlot(s)}`, tone: "move" };
    }
  }

  const pinnedPositions = useMemo<Record<string, Zone>>(() => {
    const pins: Record<string, Zone> = {};
    // Recent arrivals: short last stint. Stints are in GAME time (the
    // live store's clock), so the demo's 8× quarters don't read every
    // full-quarter stint as a recent sub. Steve 2026-05-20.
    for (const [pid, dur] of Object.entries(lastStintMs)) {
      const z = lastStintZone[pid];
      if (z && dur < RECENT_ARRIVAL_MS) pins[pid] = z;
    }
    // Field-locked: always stay in their last zone (never go to bench)
    for (const pid of lockedIds) {
      const z = lastStintZone[pid];
      if (z) pins[pid] = z;
    }
    // Zone-locked: prefer their locked zone at quarter breaks
    for (const [pid, z] of Object.entries(zoneLockedPlayers)) {
      pins[pid] = z;
    }
    return pins;
  }, [lastStintMs, lastStintZone, lockedIds, zoneLockedPlayers]);

  // Q-just-ended teammate cohorts, keyed by player id. Built from
  // the END-of-quarter lineup (already in the live store) so it
  // captures exactly who shared a zone (or sat the bench) with whom
  // when the hooter went. Drives the suggester's partnership penalty
  // — see fairness.ts PARTNERSHIP_PENALTY.
  const previousZoneTeammates = useMemo(
    () => zoneTeammatesFromLineup(lineup),
    [lineup]
  );

  const suggestedLineup = useMemo(() => {
    if (availableForLineup.length === 0) return lineup;
    // `lastStintZone` is the zone each player ended the just-finished
    // quarter in (set by endCurrentQuarter when stints flush). The
    // suggester uses it to penalise re-using the same zone two
    // quarters running. The partnership penalty (driven by
    // `previousZoneTeammates`) handles the don't-clump-together rule
    // — replacing the older cluster penalty that compared source
    // zones in aggregate.
    // Phase D: chip-by-id map drives the chip-spread penalty so the
    // suggester scatters older/younger (or whatever the coach labels
    // each chip) across zones rather than bunching them.
    const chipByPlayerId: Record<string, "a" | "b" | "c" | null | undefined> = {};
    // Cohort chips retired with How we play (UX plan 5.8): their intent now lives in roles and rules.
    const suggested = suggestStartingLineup(
      healthyForLineup,
      combinedZoneMins,
      currentQuarter * 1000 + healthyForLineup.length,
      effectiveZoneCaps,
      currentGameZoneMins,
      pinnedPositions,
      lastStintZone,
      previousZoneTeammates,
      seasonAvailability,
      chipByPlayerId,
      chipModeByKey,
      fullPeriodMs,
      aflPlaybook,
    );
    // Put any injured / loaned players back on the bench so they're still
    // visible to the coach but cannot be sent on.
    return {
      ...suggested,
      bench: [...suggested.bench, ...sidelinedIdsInLineup],
    };
  }, [
    availableForLineup.length,
    healthyForLineup,
    sidelinedIdsInLineup,
    combinedZoneMins,
    currentQuarter,
    lineup,
    effectiveZoneCaps,
    currentGameZoneMins,
    pinnedPositions,
    lastStintZone,
    previousZoneTeammates,
    seasonAvailability,
  ]);

  // Manual-mode draft: wipe positions, park every healthy player on
  // the bench (sidelined players stay on bench too — they're appended
  // separately below). Coach builds from this blank slate via tap-tap.
  const manualLineup = useMemo<Lineup>(() => {
    return {
      back: [],
      hback: [],
      mid: [],
      hfwd: [],
      fwd: [],
      bench: healthyForLineup.map((p) => p.id),
    };
  }, [healthyForLineup]);

  // "Rotate lines" draft (Idea 2, Steve 2026-07-07): everyone shifts one
  // line up the ground, zone sizes fixed, overflow filled by least time
  // in the destination zone. Uses the SAME time-in-zone + last-zone the
  // suggester reads, so it's a drop-in alternative to `suggestedLineup`.
  const rotatedLineup = useMemo<Lineup>(() => {
    if (availableForLineup.length === 0) return lineup;
    return rotateLines({
      players: healthyForLineup.map((p) => p.id),
      caps: effectiveZoneCaps,
      zoneMins: currentGameZoneMins,
      lastZone: lastStintZone,
      sidelinedIds: sidelinedIdsInLineup,
    });
  }, [
    availableForLineup.length,
    healthyForLineup,
    effectiveZoneCaps,
    currentGameZoneMins,
    lastStintZone,
    sidelinedIdsInLineup,
    lineup,
  ]);

  // Only re-derive `draft` when the user EXPLICITLY changes the
  // lineup mode. Without this guard, the effect re-fires whenever
  // any of suggestedLineup / manualLineup / lineup recomputes
  // underneath — and they DO recompute on:
  //   • The live store re-hydrating post-mount (basePlayedZoneMs
  //     ticks → currentGameZoneMins → combinedZoneMins →
  //     suggestedLineup)
  //   • setLineup() in handleStart() before router.refresh() —
  //     the store mutation makes `lineup` change, the effect
  //     fires, and the user's just-committed draft gets briefly
  //     overwritten by a freshly-recomputed suggestion.
  // Steve's user feedback 2026-05-09: at Q-break the lineup
  // "starts with a suggested lineup and then refreshes to a new
  // lineup a few seconds later", and on tap-to-start-next-quarter
  // it flickers similarly. Both traced to this useEffect.
  const lastAppliedModeRef = useRef<typeof lineupMode | null>(null);
  // F2 pre-seed: when the coach pinned this upcoming period's lineup, open
  // the break ON that plan instead of the fresh suggestion. Runs BEFORE the
  // mode effect below (declaration order = mount run order) and primes
  // `lastAppliedModeRef` to the current mode so the suggested/manual effect
  // treats the seed as the applied initial state and does NOT stomp it
  // (D-12). Applied once; a late-hydrating pin still seeds via the guard.
  const didSeedRef = useRef(false);
  useEffect(() => {
    if (availableForLineup.length === 0) return;
    if (didSeedRef.current) return;
    if (!seededDraft) return;
    didSeedRef.current = true;
    setDraft(seededDraft);
    setSelected(null);
    lastAppliedModeRef.current = lineupMode;
  }, [seededDraft, lineupMode, availableForLineup.length]);
  useEffect(() => {
    if (availableForLineup.length === 0) return;
    if (lastAppliedModeRef.current === lineupMode) return;
    lastAppliedModeRef.current = lineupMode;
    const next =
      lineupMode === "suggested"
        ? suggestedLineup
        : lineupMode === "rotate"
          ? rotatedLineup
          : lineupMode === "manual"
            ? manualLineup
            : lineup;
    setDraft(next);
    setSelected(null);
  }, [lineupMode, suggestedLineup, rotatedLineup, manualLineup, lineup, availableForLineup.length]);

  // The coach's staged lineup survives leaving the live screen (the team
  // page and back, a reload): kept in the live store, restored here over
  // the seed and suggestion above (declared after them, so it wins), for
  // the kids who can still play. Shared with the netball break.
  const stagedForStore = useMemo(
    () => ({
      groups: { back: draft.back, hback: draft.hback, mid: draft.mid, hfwd: draft.hfwd, fwd: draft.fwd },
      bench: draft.bench,
    }),
    [draft],
  );
  const healthyIds = useMemo(() => healthyForLineup.map((p) => p.id), [healthyForLineup]);
  const stagedBreakDraft = useStagedBreakDraft({
    gameId,
    period: nextQuarter,
    ready: availableForLineup.length > 0,
    groupIds: ALL_ZONES,
    availableIds: healthyIds,
    benchOnlyIds: sidelinedIdsInLineup,
    staged: stagedForStore,
    mode: lineupMode,
    onRestore: (restored) => {
      setDraft({
        back: restored.groups.back ?? [],
        hback: restored.groups.hback ?? [],
        mid: restored.groups.mid ?? [],
        hfwd: restored.groups.hfwd ?? [],
        fwd: restored.groups.fwd ?? [],
        bench: restored.bench,
      });
      const mode = restored.mode as RotationMode;
      if (["suggested", "keep", "manual", "rotate"].includes(mode)) {
        lastAppliedModeRef.current = mode;
        setLineupMode(mode);
      }
      didSeedRef.current = true;
      setSelected(null);
    },
  });

  // ─── Match-adjustment panel state ─────────────────────────────
  // The size dropdown is locally controlled — Q-break is a "stage"
  // moment, so we don't optimistically rerender the lineup picker
  // grid for the new caps. The coach sees "Q3 will play 10 a side"
  // confirmation instead, and the next quarter's render picks up
  // the new caps via router refresh after they hit Resume.
  const sizeOptions = useMemo(() => {
    const out: number[] = [];
    for (let s = maxOnFieldSize; s >= minOnFieldSize; s--) out.push(s);
    return out;
  }, [minOnFieldSize, maxOnFieldSize]);
  const [pendingSize, setPendingSize] = useState<number>(currentOnFieldSize);
  // Sync local state if the server-side currentOnFieldSize changes.
  useEffect(() => {
    setPendingSize(currentOnFieldSize);
  }, [currentOnFieldSize]);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [sizePending, startSizeTransition] = useTransition();

  function handleSizeChange(next: number) {
    if (next === currentOnFieldSize) {
      setPendingSize(next);
      return;
    }
    setSizeError(null);
    setPendingSize(next);
    startSizeTransition(async () => {
      const result = await setOnFieldSizeAction(auth, gameId, next);
      if (!result.success) {
        setSizeError(result.error);
        setPendingSize(currentOnFieldSize);
        return;
      }
      // The new caps come down via router.refresh after the user
      // taps Resume next quarter — handleStart already calls it.
      // Here we just confirm to the coach that the change took.
      reactStartTransition(() => router.refresh());
    });
  }

  // ─── Lend-player panel state ──────────────────────────────────
  // Tap a chip to un-lend a current loaner; tap "Lend a player" to
  // open a SlotFillSheet listing only available squad members.
  const [loanPending, startLoanTransition] = useTransition();
  const [loanError, setLoanError] = useState<string | null>(null);
  const [lendPickerOpen, setLendPickerOpen] = useState(false);

  function handleLoanToggle(pid: string, nextLoaned: boolean) {
    setLoanError(null);
    setLoaned(pid, nextLoaned);
    // Recall (nextLoaned === false): drop the player onto the staged draft
    // bench so they're immediately fieldable at THIS break. A player lent
    // before kickoff was never placed in the lineup, so without this they'd
    // stay missing from the picker until the quarter actually started — the
    // exact bug coaches hit. Only add if they aren't already in the draft
    // (an in-game lend is already sitting on the bench).
    const wasInDraft =
      draft.bench.includes(pid) || ALL_ZONES.some((z) => draft[z].includes(pid));
    const addedToDraft = !nextLoaned && !wasInDraft;
    if (addedToDraft) {
      setDraft((d) => ({ ...d, bench: [...d.bench, pid] }));
    }
    // A kid lent at the break sits out from the next quarter, so they
    // come off the staged field now (they used to start it on the field).
    if (nextLoaned) {
      setDraft((prev) => benchPlayerInLineup(prev, pid));
    }
    startLoanTransition(async () => {
      const result = await markLoan(auth, gameId, {
        player_id: pid,
        loaned: nextLoaned,
        // Loan stints flip at the boundary between quarters. The
        // coach is staging Q{nextQuarter}; the event semantically
        // applies "from the start of Q{nextQuarter}".
        quarter: nextQuarter,
        elapsed_ms: 0,
      });
      if (!result.success) {
        // Roll back the optimistic flip (and the draft add, if we made one).
        setLoaned(pid, !nextLoaned);
        if (addedToDraft) {
          setDraft((d) => ({ ...d, bench: d.bench.filter((p) => p !== pid) }));
        }
        setLoanError(result.error);
      }
    });
  }

  // Mirror of handleLoanToggle for injuries — Steve's real-game
  // scenario is "kid had to leave at quarter time" (parent took
  // them home, hurt during the break, etc.). The injury event
  // applies from the start of the next quarter.
  function handleInjuryToggle(pid: string, nextInjured: boolean) {
    setLoanError(null);
    setInjured(pid, nextInjured);
    // An injured player can't stay on the field. The staged draft is NOT
    // auto-reconciled to mid-break injury changes (by design — see the
    // suggested/manual mode effect, which guards against stomping coach
    // edits), so pull them to the bench here. Without this they started
    // the next quarter still on-field and kept accruing minutes despite
    // the INJ badge (Steve 2026-06-15). The vacated zone shows its
    // "+ Add" affordance so the coach can bring a healthy player on.
    if (nextInjured) {
      setDraft((prev) => benchPlayerInLineup(prev, pid));
    }
    startLoanTransition(async () => {
      const result = await markInjury(auth, gameId, {
        player_id: pid,
        injured: nextInjured,
        quarter: nextQuarter,
        elapsed_ms: 0,
      });
      if (!result.success) {
        setInjured(pid, !nextInjured);
        setLoanError(result.error);
      }
    });
  }

  // ─── Manage-availability handlers (AVAIL-02) ──────────────────
  // Add a newly-arrived player into the game at the break. Reuses the
  // canonical addLateArrival writer (same as LiveGame.handleLateArrival
  // / LeagueLiveGame.handleAddLateArrival — DO NOT fork). The arrival
  // joins the bench and the next-quarter rotation can work them in.
  function handleAddArrived(playerId: string) {
    setLoanError(null);
    setAddArrivedPickerOpen(false);
    // Land them on the staged bench immediately so the coach sees them
    // before the refresh round-trips the player_arrived event.
    setDraft((prev) =>
      prev.bench.includes(playerId)
        ? prev
        : { ...prev, bench: [...prev.bench, playerId] },
    );
    // And in the store's lineup, as an in-game arrival is (LiveGame's
    // handleLateArrival): the refresh doesn't re-init the store, so the
    // break would otherwise forget them on a mode change, or when its
    // staged draft is restored after the team page and back.
    addBenchPlayer(playerId);
    startLoanTransition(async () => {
      const { flushed } = enqueueLiveAction("addLateArrival", [
        auth,
        gameId,
        { player_id: playerId, quarter: nextQuarter, elapsed_ms: 0 },
      ]);
      await flushed;
      router.refresh();
    });
  }

  // Coach tapped "Mark a player out" then picked an on-field player.
  // Mark-out mirrors the injury flow (D-09): if the player is on the
  // field and there's a bench player to swap in, open the replacement
  // picker; otherwise fall straight through to the direct out write.
  function handleMarkOutPick(playerId: string) {
    setMarkOutPickerOpen(false);
    const zone = slotOf(playerId, draft);
    const hasReplacement = outReplacementCandidates.length > 0;
    if (zone && zone !== "bench" && hasReplacement) {
      setOutReplacement({ outId: playerId, zone: zone as Zone });
      return;
    }
    // Direct path: no bench replacement available, or the player isn't
    // in a field zone — just flag them out (still keeps earned time).
    handleOutDirect(playerId);
  }

  // Mark a player out WITHOUT a replacement (skip / no bench). Records
  // the out reason; the vacated zone is simply left a player short for
  // the coach to fill manually.
  function handleOutDirect(playerId: string) {
    setOutReplacement(null);
    setLoanError(null);
    setInjured(playerId, true);
    // Off the staged field: they used to start the next quarter on it.
    setDraft((prev) => benchPlayerInLineup(prev, playerId));
    startLoanTransition(async () => {
      const result = await markInjury(auth, gameId, {
        player_id: playerId,
        injured: true,
        quarter: nextQuarter,
        elapsed_ms: 0,
        reason: "out",
      });
      if (!result.success) {
        setInjured(playerId, false);
        setLoanError(result.error);
      }
    });
  }

  // Coach picked the bench replacement in the InjuryReplacementModal.
  // Fires the same two-step as the injury flow (mark out THEN swap) so
  // the replacement lands at the vacated zone; the out player keeps the
  // field time they already earned (D-09 — same mechanic as injury).
  function handleOutReplacement(
    outId: string,
    replacementId: string,
    zone: Zone,
  ) {
    setOutReplacement(null);
    setLoanError(null);
    setInjured(outId, true);
    // Reflect the swap in the staged next-quarter draft so the coach
    // sees the replacement take the spot before the refresh. The out
    // player comes off (the replacement used to be added beside them).
    setDraft((prev) => replaceInLineup(prev, outId, replacementId, zone));
    enqueueLiveAction("markInjury", [
      auth,
      gameId,
      {
        player_id: outId,
        injured: true,
        quarter: nextQuarter,
        elapsed_ms: 0,
        reason: "out",
      },
    ]);
    const { flushed } = enqueueLiveAction("recordSwap", [
      auth,
      gameId,
      {
        off_player_id: outId,
        on_player_id: replacementId,
        zone,
        quarter: nextQuarter,
        elapsed_ms: 0,
      },
    ]);
    startLoanTransition(async () => {
      await flushed;
      router.refresh();
    });
  }

  // ─── Match-adjustments collapse state ─────────────────────────
  // Collapsed by default — most coaches won't change size or lend a
  // player in any given quarter, so we keep the screen quiet. When
  // the section is closed we surface a one-line summary so the
  // coach knows whether anything is currently set.
  // Match-adjustments section: collapsed when fresh, but auto-
  // expanded if the coach already has a non-default state set
  // (lent or injured player, on-field-size override). Without
  // this, Steve's real-game complaint was "the UX only allows a
  // player to be lent while the quarter is running" — the section
  // existed but was closed and so invisible. Auto-opening when
  // there's an active state makes the management surface
  // discoverable exactly when you need it.
  // Steve 2026-05-13: always start the Game settings collapse closed.
  // Previously the initialiser auto-expanded when ANY setting was
  // non-default (lent / injured / size / rotation mode), but the
  // collapsed-header summary now spells out the active state in
  // plain English ("Auto-rebalanced · 1 lent · No injured") which
  // removes the discoverability problem the auto-expand was solving.
  // Always-closed-by-default keeps the QB visually quiet and
  // predictable across every quarter break.
  const [matchAdjustmentsOpen, setMatchAdjustmentsOpen] = useState(false);
  // Lend picker (existing) and injured picker (new) both reuse the
  // same SlotFillSheet shape. State is split so the two pickers
  // don't fight if a coach somehow opens both.
  const [injuredPickerOpen, setInjuredPickerOpen] = useState(false);
  // ─── Manage-availability (AVAIL-02) break-surface state ───────
  // Two NEW affordances next to Lend / Mark-injured (D-07/D-08):
  //   • "Add arrived player" — a squad member who wasn't available
  //     pre-game turns up at the break; addLateArrival writer.
  //   • "Mark a player out" — an on-field player has to leave; mirrors
  //     the injury flow (D-09): force a replacement pick from the bench
  //     so the vacated zone doesn't go short. Recorded with a distinct
  //     reason:"out" so display can tell "out" from a genuine injury.
  const [addArrivedPickerOpen, setAddArrivedPickerOpen] = useState(false);
  const [markOutPickerOpen, setMarkOutPickerOpen] = useState(false);
  // When set, the InjuryReplacementModal is shown for the mark-out
  // forced-replacement pick. zone = the on-field zone the out player
  // is vacating (so the replacement lands in the same spot).
  const [outReplacement, setOutReplacement] = useState<{
    outId: string;
    zone: Zone;
  } | null>(null);
  const lentPlayers = useMemo(
    () =>
      players
        .filter((p) => loanedSet.has(p.id) && !injuredSet.has(p.id)),
    [players, loanedSet, injuredSet],
  );
  const injuredPlayers = useMemo(
    () => players.filter((p) => injuredSet.has(p.id)),
    [players, injuredSet],
  );

  // ─── Manage-availability candidate lists (AVAIL-02) ───────────
  // Add-arrived: squad members who are NOT already in the lineup
  // (neither on a field zone nor on the bench) — i.e. they weren't
  // marked available pre-game. Tapping one fires addLateArrival and
  // lands them on the staged bench.
  const arrivalCandidates = useMemo(() => {
    const inLineup = new Set(availableForLineup.map((p) => p.id));
    return players
      .filter((p) => !inLineup.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.full_name,
        jerseyNumber: p.jersey_number,
      }));
  }, [players, availableForLineup]);

  // Mark-out: on-field players in the staged draft (every field zone,
  // excluding the bench and anyone already sidelined). Picking one
  // forces a bench-replacement pick so the vacated zone doesn't go
  // short (mirrors the in-game injury flow, D-09).
  const markOutCandidates = useMemo(() => {
    const ids: string[] = [];
    for (const z of ALL_ZONES) ids.push(...draft[z]);
    return ids
      .filter((id) => !sidelinedSet.has(id))
      .map((id) => playersById.get(id))
      .filter((p): p is Player => !!p)
      .map((p) => ({
        id: p.id,
        name: p.full_name,
        jerseyNumber: p.jersey_number,
      }));
  }, [draft, sidelinedSet, playersById]);

  // Bench replacements eligible to take the vacated spot, pre-sorted
  // ascending by field time so the least-played kid is the suggested
  // pick (mirrors LeagueLiveGame's InjuryReplacementModal feed).
  const outReplacementCandidates = useMemo<InjuryReplacementCandidate[]>(() => {
    return draft.bench
      .filter((id) => !sidelinedSet.has(id))
      .map((id) => playersById.get(id))
      .filter((p): p is Player => !!p)
      .map((p) => {
        const zm = basePlayedZoneMs[p.id];
        const totalMs = zm
          ? ALL_ZONES.reduce((a, z) => a + (zm[z] ?? 0), 0)
          : 0;
        return { player: p, totalMs };
      })
      .sort((a, b) => a.totalMs - b.totalMs);
  }, [draft.bench, sidelinedSet, playersById, basePlayedZoneMs]);

  // ─── Period recap (read from store) ───────────────────────────
  const scoreByQuarter = useLiveGame((s) => s.scoreByQuarter);
  // Surface "Q{currentQuarter}: us X.Y (pts) — them X.Y (pts)" plus
  // running totals. Coach reads this to sync up with the opposition's
  // record before resuming. Team is the LEFT, opp is the RIGHT.
  const justEndedQuarter = currentQuarter; // QuarterBreak shows AFTER Q ends.
  const thisQuarterScore = scoreByQuarter[justEndedQuarter] ?? null;
  const totalUs = useLiveGame((s) => s.teamScore);
  const totalThem = useLiveGame((s) => s.opponentScore);
  const aflPts = (g: number, b: number) => g * 6 + b;

  const [showFixScores, setShowFixScores] = useState(false);

  function lineupsEqual(a: Lineup, b: Lineup): boolean {
    const keys: (keyof Lineup)[] = ["back", "hback", "mid", "hfwd", "fwd", "bench"];
    for (const k of keys) {
      if (a[k].length !== b[k].length) return false;
      const sa = [...a[k]].sort();
      const sb = [...b[k]].sort();
      for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
    }
    return true;
  }

  // Two-step kickoff (Steve 2026-05-13): "Ready for Q{n+1}" used to
  // fire recordLineupSet + startQuarter immediately, then the modal
  // surfaced for the umpire's whistle gate. "Back to lineup" on that
  // modal was a dead-end — the period_break_swap had already
  // committed, no way back to the editable QB picker. Now: Ready
  // opens the modal here; only Start Q{n+1} commits both writes
  // atomically (lineup_set first, then quarter_start). "Back to
  // lineup" cleanly cancels — zero server writes.
  const [startModalOpen, setStartModalOpen] = useState(false);

  // Anchor for walking up the DOM tree to find scrolled ancestors —
  // see the comment in handleOpenStartModal below.
  const quarterBreakRootRef = useRef<HTMLDivElement>(null);

  function handleOpenStartModal() {
    setError(null);
    // Reset every scrolled ancestor before opening the modal. The
    // public demo at /run/{token} wraps the app in DeviceFrame, which
    // applies `transform: translateZ(0)` for rounded-corner clipping
    // — that transform makes the frame a containing block for any
    // `position: fixed` descendant, so the modal anchors to the
    // phone-frame's bounds rather than the browser viewport. When the
    // GM has scrolled the frame's content down to see the back of the
    // lineup, the modal then renders at the top of the frame and its
    // primary "Start Q{n}" button can drop below the visible scroll
    // window. Scrolling everything to 0 first puts the user at the
    // top of the frame, which is where the modal centres. window.
    // scrollTo covers the non-framed (mobile / installed PWA) case.
    if (typeof document !== "undefined") {
      let el = quarterBreakRootRef.current?.parentElement ?? null;
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
    setError(null);
    // Unlock audio INSIDE this tap, before any await — the goal song's
    // autoplay otherwise gets blocked once the start writes go async
    // (issue 1).
    onPrimeAudio?.();
    // Normalise draft shape before sending (defensive — always full-zones).
    // Nobody injured, lent or out starts the quarter on the field, however
    // the draft got there (e.g. "Keep last quarter" picked after a lend).
    const full: Lineup = benchSidelinedInLineup(
      { ...emptyLineup(), ...draft },
      sidelinedSet,
    );
    startTransition(async () => {
      if (!lineupsEqual(lineup, full)) {
        const r = await recordLineupSet(auth, gameId, full);
        if (!r.success) {
          setError(r.error);
          setStartModalOpen(false);
          return;
        }
        setLineup(full);
      }
      const result = await startQuarterAction(auth, gameId, nextQuarter);
      if (!result.success) {
        setError(result.error);
        setStartModalOpen(false);
        return;
      }
      // The staged lineup is now the quarter's: nothing left to restore.
      stagedBreakDraft.clear();
      onStarted();
      // D-14: the next-period pin has now been consumed (it seeded this
      // break's draft, which we've just committed). Clear it so it can't
      // leak into a later period. Only clear a pin that targeted THIS
      // upcoming period — an unrelated/F1 pin is left to the store's own
      // quarter-transition logic.
      // This period's plan (pinned mid-game or before kickoff) is used;
      // later planned periods stay for their own breaks.
      if (plannedRotation && plannedRotation.gameId === gameId) {
        setPlannedRotation(consumePeriodPin(plannedRotation, upcomingPeriodIndex));
      }
      // Start the local clock right away — the modal commit is the
      // umpire's whistle, no further user action needed. Without
      // this the LiveGame mount after refresh would land with
      // clockStartedAt=null (beginNextQuarter resets it) and there's
      // no longer a LiveGame StartQuarterModal to bridge.
      startClock();
      // Medium haptic — the "go!" tap that kicks off the quarter.
      // Distinct from a light tap (score, swap) because this is a
      // deliberate consequential action the umpire's whistle aligns
      // to. P1-10 in MICRO-INTERACTIONS-PLAN.md.
      void hapticTap("medium");
      // Server-rendered events list is now stale; refresh so the page
      // picks up the new quarter_start event and re-renders into LIVE.
      // Mirrors Plan 05-04's netball fix.
      reactStartTransition(() => router.refresh());
    });
  }

  return (
    <div ref={quarterBreakRootRef} className="space-y-4">
      {/* Orientation strip — Steve 2026-05-13: the hero card used to
          dominate the QB top, but with the rotation toggle moved out
          (commit ba04bd1) and the fairness number removed in this
          commit, it had no functional content left worth a bordered
          card. Replace with a flush, no-chrome heading that visually
          rhymes with the GameInfoHeader strip above it. Steve
          2026-05-13 (follow-up): mode hint paragraph dropped too —
          the active mode now reads off the Game settings collapsed
          header below (e.g. "Auto-rebalanced") so duplicating it
          here was just noise. */}
      <div className="px-1">
        <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
          Quarter break
        </p>
        <p className="mt-0.5 text-lg font-bold text-ink">
          Lineup for Q{nextQuarter}
        </p>
        {hasPlannedSeed && (
          <p
            data-testid="planned-seed-banner"
            className="mt-1 font-mono text-[10px] font-bold uppercase tracking-micro text-brand-700"
          >
            Pre-filled from your planned Q{nextQuarter} lineup
          </p>
        )}
      </div>

      {/* Game settings — collapsed by default. Steve 2026-05-13: the
          per-break header used to carry the rotation toggle (Suggested/
          Keep/Manual) + a hint paragraph + the title + fairness, and
          then the Match-adjustments card sat below with size/lend/
          injured. That's a lot of noise above the actual zone tiles.
          Consolidate everything-that-is-a-setting into one collapse
          named "Game settings" (matching the LineupPicker pattern).
          The current mode shows up in the collapsed summary line so a
          coach can tell at a glance what's in effect without expanding. */}
      <div className="rounded-md border border-hairline bg-surface shadow-card">
        <button
          type="button"
          onClick={() => setMatchAdjustmentsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
          aria-expanded={matchAdjustmentsOpen}
          aria-controls="qb-match-adjustments"
        >
          <span className="flex flex-1 items-center gap-3 text-sm">
            <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
              Game settings
            </span>
            <span className="text-xs text-ink-mute">
              {(() => {
                // Summary line — always surface lent/injured status
                // (even when both are zero) so the closed header
                // doubles as a discovery hint for what's inside the
                // collapse. A coach who doesn't know they can lend/
                // mark-injured at the break sees "No lent · No
                // injured" and learns the affordances exist. Size
                // only shows when non-default. The rotation mode no
                // longer leads here — the toggle moved out of the
                // collapse to sit above the zone cards (UX review
                // #7, Steve 2026-07-08).
                const bits: string[] = [];
                if (currentOnFieldSize !== defaultOnFieldSize) {
                  bits.push(`${currentOnFieldSize} on field`);
                }
                bits.push(
                  lentPlayers.length > 0
                    ? `${lentPlayers.length} lent`
                    : "No lent",
                );
                bits.push(
                  injuredPlayers.length > 0
                    ? `${injuredPlayers.length} injured`
                    : "No injured",
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
                matchAdjustmentsOpen ? "rotate-180" : ""
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

        {matchAdjustmentsOpen && (
          <div
            id="qb-match-adjustments"
            className="space-y-4 border-t border-hairline px-4 py-3"
          >
            {/* On-field size dropdown */}
            <div>
              <label
                htmlFor="qb-on-field-size"
                className="block text-xs font-semibold text-ink"
              >
                On-field size
              </label>
              <div className="mt-1 flex items-center gap-2">
                <select
                  id="qb-on-field-size"
                  value={pendingSize}
                  onChange={(e) => handleSizeChange(parseInt(e.target.value, 10))}
                  disabled={sizePending || isPending}
                  className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-surface-alt disabled:text-ink-mute"
                >
                  {sizeOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                      {s === defaultOnFieldSize ? " (default)" : ""}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-ink-mute">
                  {currentOnFieldSize === defaultOnFieldSize
                    ? `Default for this age group.`
                    : `Currently playing ${currentOnFieldSize} a side.`}
                </span>
              </div>
              {sizeError && (
                <p className="mt-1 text-xs text-danger" role="alert">
                  {sizeError}
                </p>
              )}
            </div>

            {/* Lend players — chips for current loaners + a picker
                button. Listing only the lent players (rather than
                every squad member) keeps the surface small even with
                a 22-player squad. */}
            <div>
              <p className="text-xs font-semibold text-ink">Lend a player</p>
              <p className="mt-0.5 text-xs text-ink-mute">
                Lent players sit out for the rest of the game until you bring
                them back.
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
                      onClick={() => handleLoanToggle(p.id, false)}
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

            {/* Injured / left-early — paralleling Lend. The common
                Saturday case is a kid leaving at quarter time
                (parent pulls them out, niggle from the prior
                quarter, etc.); marking injured at the break excludes
                them from the next-quarter rotation without needing
                the long-press flow. */}
            <div>
              <p className="text-xs font-semibold text-ink">
                Injured / left early
              </p>
              <p className="mt-0.5 text-xs text-ink-mute">
                Injured players sit out for the rest of the game until you
                bring them back.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {injuredPlayers.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full border border-danger/50 bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger"
                  >
                    {p.jersey_number != null && (
                      <span className="tabular-nums font-semibold">
                        {p.jersey_number}
                      </span>
                    )}
                    <span>{p.full_name}</span>
                    <button
                      type="button"
                      onClick={() => handleInjuryToggle(p.id, false)}
                      disabled={loanPending}
                      aria-label={`Mark ${p.full_name} fit`}
                      className="ml-0.5 rounded-full px-1 text-[11px] font-bold leading-none text-danger/80 hover:bg-danger/15 hover:text-danger disabled:opacity-60 motion-safe:active:scale-[0.97]"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setInjuredPickerOpen(true)}
                  disabled={loanPending}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger disabled:opacity-60 motion-safe:active:scale-[0.97]"
                >
                  <span aria-hidden>+</span>
                  Mark injured
                </button>
              </div>
            </div>

            {/* Manage availability (AVAIL-02 / B2) — two new break-time
                affordances mirroring Lend / Mark-injured:
                  • Add arrived player: a squad member who wasn't
                    available pre-game turns up at the break. Reuses the
                    canonical addLateArrival writer (same as the in-game
                    LateArrivalMenu) — the arrival lands on the bench and
                    the next-quarter rotation works them in.
                  • Mark a player out: an on-field player has to leave.
                    Mirrors the injury flow — forces a bench-replacement
                    pick so the vacated zone doesn't go short. Recorded
                    with a distinct reason:"out" so display can tell an
                    "out" from a genuine injury. */}
            <div>
              <p className="text-xs font-semibold text-ink">
                Manage availability
              </p>
              <p className="mt-0.5 text-xs text-ink-mute">
                Add a player who turned up at the break, or take one out of
                the game (a replacement comes on so the zone stays full).
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAddArrivedPickerOpen(true)}
                  disabled={loanPending}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors hover:border-brand-500/40 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60 motion-safe:active:scale-[0.97]"
                >
                  <span aria-hidden>+</span>
                  Add arrived player
                </button>
                <button
                  type="button"
                  onClick={() => setMarkOutPickerOpen(true)}
                  disabled={loanPending}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger disabled:opacity-60 motion-safe:active:scale-[0.97]"
                >
                  <span aria-hidden>+</span>
                  Mark a player out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lend-player picker modal — opens from the "+ Lend a player"
          button above. Lists every healthy, not-already-lent squad
          member; tap one to lend them for the rest of the game. */}
      {lendPickerOpen && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Lend"
          subtitle="Pick a player to lend to the opposition for the rest of the game. Tap their chip to bring them back."
          emptyMessage="Everyone is already lent or injured."
          candidates={players
            .filter(
              (p) => !loanedSet.has(p.id) && !injuredSet.has(p.id),
            )
            .map((p) => ({
              id: p.id,
              name: p.full_name,
              jerseyNumber: p.jersey_number,
            }))}
          onPick={(pid) => {
            handleLoanToggle(pid, true);
            setLendPickerOpen(false);
          }}
          onCancel={() => setLendPickerOpen(false)}
        />
      )}

      {/* Injured-player picker — same shape as the lend picker but
          flips the injury flag instead. Used when a player has to
          leave at quarter time (parent pulls them out, niggle
          flared up during the break). */}
      {injuredPickerOpen && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Mark injured"
          subtitle="Pick a player to mark as injured / leaving early. Tap their chip to bring them back."
          emptyMessage="Everyone is already injured or lent."
          candidates={players
            .filter(
              (p) => !loanedSet.has(p.id) && !injuredSet.has(p.id),
            )
            .map((p) => ({
              id: p.id,
              name: p.full_name,
              jerseyNumber: p.jersey_number,
            }))}
          onPick={(pid) => {
            handleInjuryToggle(pid, true);
            setInjuredPickerOpen(false);
          }}
          onCancel={() => setInjuredPickerOpen(false)}
        />
      )}

      {/* Add-arrived picker — opens from "+ Add arrived player". Lists
          squad members who weren't available pre-game (not in the
          lineup). Tapping one fires addLateArrival and lands them on
          the staged bench. */}
      {addArrivedPickerOpen && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Add arrived"
          subtitle="Pick a squad member who's turned up at the break. They'll join the bench and the next quarter can work them in."
          emptyMessage="Everyone in the squad is already in the game."
          candidates={arrivalCandidates}
          onPick={handleAddArrived}
          onCancel={() => setAddArrivedPickerOpen(false)}
        />
      )}

      {/* Mark-out picker — opens from "+ Mark a player out". Lists the
          on-field players in the staged draft. Picking one forces a
          bench-replacement pick (InjuryReplacementModal) so the vacated
          zone doesn't go short; recorded with reason:"out". */}
      {markOutPickerOpen && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Mark out"
          subtitle="Pick the on-field player who has to leave. A bench player comes on so the zone stays full."
          emptyMessage="No on-field players to take out."
          candidates={markOutCandidates}
          onPick={handleMarkOutPick}
          onCancel={() => setMarkOutPickerOpen(false)}
        />
      )}

      {/* Mark-out forced-replacement — reuses the shared
          InjuryReplacementModal (DO NOT fork). Pick the bench player who
          comes on at the vacated zone; "without replacement" leaves the
          zone short. Both paths record the out player with reason:"out". */}
      {outReplacement &&
        (() => {
          const outPlayer = playersById.get(outReplacement.outId);
          if (!outPlayer) return null;
          return (
            <InjuryReplacementModal
              injuredPlayer={outPlayer}
              spotLabel={ZONE_SHORT_LABELS[outReplacement.zone]}
              candidates={outReplacementCandidates}
              onPickReplacement={(replacementId) =>
                handleOutReplacement(
                  outReplacement.outId,
                  replacementId,
                  outReplacement.zone,
                )
              }
              onSkipReplacement={() => handleOutDirect(outReplacement.outId)}
              onCancel={() => setOutReplacement(null)}
            />
          );
        })()}

      {/* Score panel — collapsed by default. Single-line score
          summary so the coach can reconcile with the opposition
          at a glance without the panel taking real estate.
          Tapping the row anywhere expands to the full per-quarter
          breakdown table + per-player event log. */}
      {currentQuarter >= 1 && (() => {
        const usPts = aflPts(totalUs.goals, totalUs.behinds);
        const themPts = aflPts(totalThem.goals, totalThem.behinds);
        const lead = usPts - themPts;
        const leadLabel =
          lead === 0 ? "level" : lead > 0 ? `+${lead}` : `${lead}`;
        const leadClass =
          lead > 0
            ? "text-ok"
            : lead < 0
              ? "text-warn"
              : "text-ink-mute";
        return (
        <div className="rounded-md border border-hairline bg-surface shadow-card">
          <button
            type="button"
            onClick={() => setShowFixScores((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
            aria-expanded={showFixScores}
            aria-label={
              showFixScores
                ? "Hide score review"
                : "Review and update scores"
            }
          >
            {/* Header rhythm matches the Game-settings collapse:
                [eyebrow] [summary] [chevron]. Steve 2026-05-13: the
                old layout used bold score numbers + a coloured pill +
                a "Review ▸" link, three different visual treatments
                in one row. Now the score is the summary value, with
                the lead margin coloured inline as the only at-a-
                glance read. Chevron is the single interaction cue. */}
            <span className="flex flex-1 items-center gap-3 text-sm">
              <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
                Score
              </span>
              <span className="nums truncate font-mono text-xs tabular-nums text-ink-mute">
                {totalUs.goals}.{totalUs.behinds} ({usPts})
                <span className="mx-1 text-ink-mute/70">–</span>
                {totalThem.goals}.{totalThem.behinds} ({themPts})
                {lead !== 0 && (
                  <>
                    <span className="mx-1 text-ink-mute/70">·</span>
                    <span className={`font-semibold ${leadClass}`}>
                      {leadLabel}
                    </span>
                  </>
                )}
              </span>
            </span>
            <span aria-hidden className="text-ink-mute">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                className={`transition-transform duration-fast ease-out-quart ${
                  showFixScores ? "rotate-180" : ""
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

          {showFixScores && (
            <div className="space-y-4 border-t border-hairline px-4 py-4">
              {/* Quarter-by-quarter breakdown table — same shape as
                  the in-game QuarterScoreModal so the coach gets a
                  consistent view of the game's shape. */}
              <QuarterScoreTable
                scoreByQuarter={scoreByQuarter}
                currentQuarter={currentQuarter}
                quarterEnded={true}
                sport="afl"
                teamName="Us"
                opponentName="Them"
              />

              <div className="border-t border-hairline pt-4">
                <ScoreReviewPanel
                  auth={auth}
                  gameId={gameId}
                  players={players}
                  includeBehinds={true}
                  defaultQuarter={currentQuarter || 1}
                />
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* Lent players — always-visible recall strip. Sourced from the whole
          squad (loanedSet), so a player lent BEFORE kickoff (who was never in
          the saved lineup) still shows here and can be brought back at the
          break, rather than only after starting the quarter. Tapping "Bring
          back" recalls them onto the staged bench, ready to field. */}
      {lentPlayers.length > 0 && (
        <div className="px-1">
          <div className="rounded-lg border border-warn/40 bg-warn-soft/60 px-3 py-2">
            <p className="text-xs font-semibold text-warn">Lent to the other team</p>
            <p className="mt-0.5 text-[11px] text-warn/80">
              Tap “Bring back” to return a player to your bench for this quarter.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {lentPlayers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleLoanToggle(p.id, false)}
                  disabled={loanPending}
                  data-testid={`qb-recall-lent-${p.id}`}
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
        </div>
      )}

      {/* Rotation mode — surfaced ABOVE the zone cards, not buried in
          the Game-settings collapse, so "Rotate lines" / "Set manually"
          are discoverable at the moment they matter (UX review #7,
          Steve 2026-07-08). Suggested reshuffles per the fairness
          scorer; Rotate lines shifts everyone one line; Keep carries
          the quarter forward; Manual wipes for a from-scratch build. */}
      {availableForLineup.length > 0 && (
        <div className="px-1">
          <RotationModeToggle
            mode={lineupMode}
            options={[
              { value: "suggested", label: "Suggested" },
              { value: "rotate", label: "Rotate lines" },
              { value: "keep", label: "Keep last quarter" },
              { value: "manual", label: "Set manually" },
            ]}
            onChange={(next) => {
              setLineupMode(next);
              // "keep" is a per-Q decision — DON'T persist it to
              // the store. It's "I want THIS quarter's lineup
              // carried forward", not a default. Next Q-break
              // falls back to whatever was previously persisted.
              if (next !== "keep") setPersistedRotationMode(next);
            }}
          />
        </div>
      )}

      {availableForLineup.length > 0 && (
        <p className="px-1 text-xs text-ink-dim">
          Tap any two players to swap them — even across zones or to the bench.
        </p>
      )}

      {/* Rule check + Why (UX plan 4.3) for the lineup about to start. */}
      {breakRuleCheck && (
        <RuleCheckBar
          items={breakRuleCheck.items}
          why={breakRuleCheck.why}
          emptySpots={ALL_ZONES.reduce((n, z) => n + Math.max(0, effectiveZoneCaps[z] - draft[z].length), 0)}
        />
      )}

      {/* Colour key for the per-player time-in-zone bars below — shown
          once so a glance at any bar reads instantly (Steve 2026-06-29:
          couldn't remember which colour was Fwd/Centre/Back). */}
      <ZoneTimeLegend
        className="px-1"
        items={[
          { label: "Fwd", swatchClassName: "bg-zone-f", textClassName: "text-zone-f" },
          { label: "Centre", swatchClassName: "bg-zone-c", textClassName: "text-zone-c" },
          { label: "Back", swatchClassName: "bg-zone-b", textClassName: "text-zone-b" },
        ]}
      />

      {/* The same field the live game uses (UX plan principle 2: one
          lineup, one picture). Tap two players to swap — across zones
          or with the bench; with a player selected, an empty spot moves
          them there; with nothing selected it opens the bench picker.
          Each tile says where the player goes next (STAYS / BENCH → FWD)
          and its bar is this game's time in zone. Long-press opens the
          player sheet (stats, injured, available). */}
      <div className="space-y-3">
        <Field
          playersById={playersById}
          lineup={draft}
          selectedPlayerId={selected}
          dimUnselected={false}
          onTapField={(pid, zone) => {
            if (pid) {
              handleTap(pid);
              return;
            }
            if (selected && !sidelinedSet.has(selected)) {
              placeInZone(selected, zone);
              setSelected(null);
              return;
            }
            setFillTargetZone(zone);
          }}
          onLongPress={(pid) => setInsightPlayerId(pid)}
          zoneMsByPlayer={basePlayedZoneMs}
          totalMsByPlayer={gameTotalMs}
          injuredIds={injuredIds}
          zoneCaps={effectiveZoneCaps}
          displayZoneCaps={displayZoneCaps}
          positionModel={positionModel}
          chipModeByKey={chipModeByKey}
          playerScores={playerScores}
          captions={breakCaptions}
          positionLabels={assignPositionLabels(draft, aflPlaybook)}
        />
        <Bench
          playersById={playersById}
          lineup={draft}
          selectedPlayerId={selected}
          dimUnselected={false}
          onTapBench={handleTap}
          onLongPress={(pid) => setInsightPlayerId(pid)}
          zoneMsByPlayer={basePlayedZoneMs}
          totalMsByPlayer={gameTotalMs}
          injuredIds={injuredIds}
          loanedIds={loanedIds}
          playerScores={playerScores}
          captions={breakCaptions}
          chipModeByKey={chipModeByKey}
        />
      </div>

      {error && <InlineAlert>{error}</InlineAlert>}

      {/* Sticky kickoff CTA — chrome owned by the shared
          QuarterKickoffBar (Phase 4b extraction). Opens
          StartQuarterModal; the modal commits both writes
          atomically (recordLineupSet if draft differs +
          startQuarter). Distinct labels at each tap so a coach
          knows what each does (commit-lineup vs start-clock —
          Stagehand showed same-label buttons broke even an LLM
          agent). */}
      <QuarterKickoffBar
        onConfirm={handleOpenStartModal}
        confirmLabel={`Start Q${nextQuarter}`}
        disabled={isPending}
      />

      {/* Await-kickoff modal — owned by QuarterBreak (Steve
          2026-05-13). Modal "Start Q{n+1}" handler runs both
          server writes atomically: recordLineupSet (if the draft
          differs from the committed lineup) then startQuarter.
          "Back to lineup" closes the modal — no writes, the QB
          picker is still editable in the background. */}
      {startModalOpen && (
        <StartQuarterModal
          quarter={nextQuarter}
          loading={isPending}
          onStart={handleConfirmStart}
          onCancel={() => setStartModalOpen(false)}
        />
      )}

      {/* Empty-zone picker sheet — opens when the coach taps a
          "Tap to fill" / "Add player" affordance. Lists every bench
          player so they can place someone in one tap. */}
      {fillTargetZone && (
        <SlotFillSheet
          slotLabel={slotLabel(fillTargetZone)}
          candidates={draft.bench
            .filter((pid) => !sidelinedSet.has(pid))
            .map((pid) => playersById.get(pid))
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

      {/* Long-press player sheet (issues 8 & 9): the same stats
          breakdown the in-game LockModal shows (shared
          PlayerInsightSummary), plus mark-injured / mark-available so a
          coach can sideline or restore a player straight from the
          break lineup — no separate picker. */}
      {insightPlayerId && (() => {
        const ip = playersById.get(insightPlayerId);
        if (!ip) return null;
        const isInjured = injuredSet.has(insightPlayerId);
        const isLoaned = loanedSet.has(insightPlayerId);
        const status = isInjured ? "Injured" : isLoaned ? "Lent" : "Available";
        return (
          <Modal>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Guernsey num={ip.jersey_number ?? ""} size={32} />
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-ink">
                    {ip.full_name}
                  </h2>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                    {status}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInsightPlayerId(null)}
                aria-label="Close"
                className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-ink-mute transition-colors hover:bg-surface-alt hover:text-ink"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              {/* `basePlayedZoneMs` is already ms — the unit
                  PlayerInsightSummary expects. Per-period + "time since
                  last sub" don't apply at a stopped break, so perPeriod
                  is empty and lastSubbedOnMs null (the component hides
                  those sections); the season mix is percentage-only. */}
              <PlayerInsightSummary
                input={breakInsightInput({
                  zones: insightZones,
                  inGameZoneMs: basePlayedZoneMs[insightPlayerId] ?? {},
                  seasonZoneMs: season[insightPlayerId] ?? {},
                  seasonPeriod: fullPeriodMs / 60000,
                })}
              />
            </div>

            <div className="mt-1 flex flex-col gap-2">
              {/* Availability actions (issues 1 & 2). A sidelined player
                  (injured OR lent) gets a single "return them" action
                  that clears the relevant status; an available player can
                  be marked injured or lent. Reuses the same writers the
                  break's pickers use (handleInjuryToggle / handleLoanToggle)
                  — no new out-state path. */}
              {isInjured ? (
                <SFButton
                  variant="primary"
                  data-testid="break-insight-injury-toggle"
                  onClick={() => {
                    handleInjuryToggle(insightPlayerId, false);
                    setInsightPlayerId(null);
                  }}
                >
                  Mark available
                </SFButton>
              ) : isLoaned ? (
                <SFButton
                  variant="primary"
                  data-testid="break-insight-lent-toggle"
                  onClick={() => {
                    handleLoanToggle(insightPlayerId, false);
                    setInsightPlayerId(null);
                  }}
                >
                  Return to game
                </SFButton>
              ) : (
                <>
                  <SFButton
                    variant="danger"
                    data-testid="break-insight-injury-toggle"
                    onClick={() => {
                      handleInjuryToggle(insightPlayerId, true);
                      setInsightPlayerId(null);
                    }}
                  >
                    Mark as injured
                  </SFButton>
                  <SFButton
                    variant="subtle"
                    data-testid="break-insight-lent-toggle"
                    onClick={() => {
                      handleLoanToggle(insightPlayerId, true);
                      setInsightPlayerId(null);
                    }}
                  >
                    Mark as lent
                  </SFButton>
                </>
              )}
              <SFButton
                variant="ghost"
                size="sm"
                onClick={() => setInsightPlayerId(null)}
              >
                Close
              </SFButton>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
