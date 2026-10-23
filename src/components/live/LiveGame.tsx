"use client";

import { SFButton, SFIcon } from "@/components/sf";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import {
  clockElapsedMs,
  useLiveGame,
} from "@/lib/stores/liveGameStore";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { aflStoreLocks, type PlayerLock } from "@/lib/live/locks";
import { hapticTap, hapticSiren } from "@/lib/haptics";
import { LongPressHint } from "@/components/live/LongPressHint";
import { Button } from "@/components/ui/Button";
import { Field, ZONE_SHORT } from "@/components/live/Field";
import { Bench } from "@/components/live/Bench";
import { ZoneTimeLegend } from "@/components/live/ZoneTimeLegend";
import { GameHeader } from "@/components/live/GameHeader";
import { QuarterScoreModal } from "@/components/live/QuarterScoreModal";
import { SwapDoneToast } from "@/components/live/SwapDoneToast";
import { SwapCard } from "@/components/live/SwapCard";
import { SwapConfirmDialog } from "@/components/live/SwapConfirmDialog";
import { LiveAdminUtilityRow } from "@/components/live/LiveAdminUtilityRow";
import { LiveGameSettingsButton } from "@/components/live/LiveGameSettingsButton";
import { ScoreRecordingDock } from "@/components/live/ScoreRecordingDock";
import { LiveStickyScoreBar } from "@/components/live/LiveStickyScoreBar";
import { QuarterBreak } from "@/components/live/QuarterBreak";
import { buildWalkthroughSteps } from "@/components/live/WalkthroughModal";
import { ClockMenu } from "@/components/live/ClockMenu";
import { SubDueBanner } from "@/components/live/SubDueBanner";
import { subDueBannerShows } from "@/components/live/SubDue";
import { playSubDueBeep, useSubDueAudioUnlock } from "@/lib/live/subDueBeep";
import { GameSummaryCard } from "@/components/live/GameSummaryCard";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import type { InjuryReplacementCandidate } from "@/components/live/InjuryReplacementModal";
import { periodPhase } from "@/lib/live/periodPhase";
import type { AgeGroupConfig } from "@/lib/sports/types";

// Perf phase 8: dynamic-import the modals that are only rendered
// in transient / rare states. Their code lives in its own chunk
// and only downloads when the gating state first flips true.
// Trade-off: a small async-load shimmer the first time each modal
// opens, in exchange for a leaner cold-start bundle on the live
// page (the most-loaded route in the app). `ssr: false` skips
// the SSR shell render for these client-only modals — they have
// no SEO value and skipping SSR keeps the server payload smaller
// too.
const QuarterEndModal = dynamic(
  () => import("@/components/live/QuarterEndModal").then((m) => m.QuarterEndModal),
  { ssr: false },
);
const FullTimeReview = dynamic(
  () => import("@/components/live/FullTimeReview").then((m) => m.FullTimeReview),
  { ssr: false },
);
const WalkthroughModal = dynamic(
  () => import("@/components/live/WalkthroughModal").then((m) => m.WalkthroughModal),
  { ssr: false },
);
const LockModal = dynamic(
  () => import("@/components/live/LockModal").then((m) => m.LockModal),
  { ssr: false },
);
const InjuryReplacementModal = dynamic(
  () =>
    import("@/components/live/InjuryReplacementModal").then(
      (m) => m.InjuryReplacementModal,
    ),
  { ssr: false },
);
const ManualEndQuarterConfirm = dynamic(
  () =>
    import("@/components/live/ManualEndQuarterConfirm").then(
      (m) => m.ManualEndQuarterConfirm,
    ),
  { ssr: false },
);
// Plan-ahead rotation (F1): the SAME shared planner used pre-game,
// seeded mid-game from the live field. Lazy — only downloads when the
// coach opens "Plan ahead".
const GamePlanModal = dynamic(
  () => import("@/components/game-plan/GamePlanModal").then((m) => m.GamePlanModal),
  { ssr: false },
);
import {
  ALL_ZONES,
  emptyZoneMs,
  suggestSwaps,
  effectiveDisplayZoneCaps,
  type GameState,
  type PlayerZoneMinutes,
  type SeasonAvailability,
  type ZoneCaps,
  type ZoneMinutes,
} from "@/lib/fairness";
import type { Game, Player, PositionModel, Zone } from "@/lib/types";
import {
  projectUpcomingRotation,
  withPinnedPeriods,
  hasPinnedPeriod,
  consumePeriodPin,
  withoutSubPin,
  resolveDisplaySuggestions,
  swapsEqual,
  availablePlayersForPlan,
  clearPeriodToBench,
  setPeriodGroups,
  type GamePlan,
} from "@/lib/game-plan";
import { rotateLines } from "@/lib/live/rotateLines";
import { positionsFor, ZONE_LABELS, ZONE_SHORT_LABELS } from "@/lib/ageGroups";
import { getSportConfig } from "@/lib/sports/registry";
import { PlayerInsightSummary } from "@/components/live/PlayerInsightSummary";
import { useHypeSong } from "@/lib/live/useHypeSong";
import { isFinalSubWindow, canPlanNextPeriod } from "@/lib/live/subCadence";
import { subIntervalStartFloor } from "@/lib/live/subDistribution";
import { LiveTopBar } from "@/components/live/LiveTopBar";

import { assignPositionLabels, type AflPlaybookInput } from "@/lib/sports/afl/engine";
import { UndoStrip } from "@/components/live/UndoStrip";
// YT IFrame API + playSong logic lives in `@/lib/live/useHypeSong`
// since 2026-05-16 (extracted for AFL/netball parity). The hook
// owns the refs, lifecycle, and trigger function.

interface LiveGameProps {
  auth: import("@/lib/types").LiveAuth;
  gameId: string;
  /**
   * The full game row — used by the in-game top bar to render the
   * compact round/date/venue strip (replaces the standalone
   * GameInfoHeader that page.tsx used to render above LiveGame).
   * Steve 2026-05-13: the global app header is hidden during /live
   * so the in-game bar needs to carry this context itself.
   */
  game: Game;
  teamName: string;
  opponentName: string;
  trackScoring: boolean;
  subIntervalSeconds: number;
  squadPlayers: Player[];
  initialState: GameState;
  season: PlayerZoneMinutes;
  /**
   * Per-player season utilisation (played vs available quarters
   * across PRIOR games). Drives the suggester's tiebreak so a
   * consistent attendee who keeps drawing the bench climbs the
   * queue ahead of teammates with similar in-game minutes today.
   */
  seasonAvailability: Record<string, SeasonAvailability>;
  /**
   * Minutes each player has been lent to the opposition across the season
   * (completed games only). Shown in the long-press loan menu so the coach
   * can spread the favour evenly.
   */
  seasonLoanMinutes: Record<string, number>;
  zoneCaps: ZoneCaps;
  positionModel: PositionModel;
  /** Currently-persisted on-field size (= sum of zoneCaps). Surfaces
   *  on the QuarterBreak's size dropdown so the coach can drop it
   *  mid-game (lent player, opp short-handed, etc). */
  currentOnFieldSize: number;
  /** Sport+age min/max bounds for the QuarterBreak size dropdown. */
  minOnFieldSize: number;
  maxOnFieldSize: number;
  /** Sport+age default — shown as a "(default)" tag on the dropdown. */
  defaultOnFieldSize: number;
  /**
   * Per-chip mode — passed to QuarterBreak's suggester. Five
   * modes since 2026-05-20: split / group / forward / centre /
   * back.
   */
  chipModeByKey?: Partial<Record<"a" | "b" | "c", import("@/lib/chips").ChipMode>>;
  /**
   * How we play (UX plan 3.6): strategy, season balance and player
   * roles for the AFL suggesters. Omitted = today's behaviour.
   */
  aflPlaybook?: AflPlaybookInput;
  exitHref?: string;
  /**
   * True when the current user has admin role on this team. Drives
   * the "Restart game" affordance — folded into the same row as
   * "+ Add late arrival" at the bottom of LiveGame so the two
   * destructive/utility actions share one strip of scrolling real
   * estate (Steve 2026-05-13).
   */
  isAdmin?: boolean;
  /** Public URL of the team song audio file, if configured. */
  songUrl?: string | null;
  /** Seconds into the song to start playback from (default 0). */
  songStartSeconds?: number;
  /** How many seconds to play the song for after each goal (default 15). */
  songDurationSeconds?: number;
  /** Game seconds per real second (games.clock_multiplier): 1 for a real
   *  game, 8 for the demo. The live store's clock runs in game ms. */
  clockMultiplier?: number;
  /** Effective quarter duration in milliseconds for this game/team/age-group.
   * Computed by parent via getEffectiveQuarterSeconds(team, ageGroup, game) * 1000.
   * D-26 / D-27: replaces hardcoded QUARTER_MS at the countdown cap and hooter trigger. */
  quarterMs: number;
  /** Full age-group config for this game (matches NetballLiveGame / LeagueLiveGame).
   * D-01: LiveGame reads ageGroup.periodCount via periodPhase() instead of hardcoding 4.
   * Existing scalar props (quarterMs, subIntervalSeconds, positionModel, defaultOnFieldSize)
   * are intentionally KEPT alongside this — collapsing the redundancy is deferred (D-01b). */
  ageGroup: AgeGroupConfig;
}

type LastScore = {
  kind: "goal" | "behind";
  forTeam: "us" | "opponent";
  playerId: string | null;
  playerName: string | null;
  quarter: number;
};

/** Per player, the later of the server's and this phone's stamp. */
function latestStamps(
  server: Record<string, number>,
  local: Record<string, number>,
): Record<string, number> {
  const out = { ...server };
  for (const [pid, ms] of Object.entries(local)) out[pid] = Math.max(out[pid] ?? ms, ms);
  return out;
}

export function LiveGame({
  auth,
  gameId,
  game,
  teamName,
  opponentName,
  trackScoring,
  subIntervalSeconds,
  squadPlayers,
  initialState,
  season,
  seasonAvailability,
  seasonLoanMinutes,
  zoneCaps,
  positionModel,
  currentOnFieldSize,
  minOnFieldSize,
  maxOnFieldSize,
  defaultOnFieldSize,
  chipModeByKey,
  aflPlaybook,
  exitHref,
  isAdmin = false,
  songUrl,
  songStartSeconds = 0,
  songDurationSeconds = 15,
  clockMultiplier = 1,
  quarterMs,
  ageGroup,
}: LiveGameProps) {
  const activeZones = useMemo(() => positionsFor(positionModel), [positionModel]);
  // F3 (Phase 12): labelled zones for the long-press player summary, derived
  // from the AFL sport config in display order and filtered to this age
  // group's zones (D-03 — never a hardcoded ALL_ZONES). Shared,
  // sport-agnostic PlayerInsightSummary renders them.
  const insightZones = useMemo(
    () => getSportConfig("afl").zones.filter((z) => ageGroup.zones.includes(z.id)),
    [ageGroup.zones],
  );
  const init = useLiveGame((s) => s.init);
  const lineup = useLiveGame((s) => s.lineup);
  const selected = useLiveGame((s) => s.selected);
  const clockStartedAt = useLiveGame((s) => s.clockStartedAt);
  const accumulatedMs = useLiveGame((s) => s.accumulatedMs);
  const currentQuarter = useLiveGame((s) => s.currentQuarter);
  const quarterEnded = useLiveGame((s) => s.quarterEnded);
  // Drives the QuarterScoreStrip below the GameHeader during live
  // play. Already populated by replay + the live store's
  // incTeam/incOpponent paths, so just read it here.
  const scoreByQuarter = useLiveGame((s) => s.scoreByQuarter);
  // Subscribed (not getState) so the QuarterEndModal's embedded
  // mini-scorebug re-renders when a late goal/behind lands inside
  // the modal — same selectors GameHeader uses elsewhere.
  const teamScoreState = useLiveGame((s) => s.teamScore);
  const opponentScoreState = useLiveGame((s) => s.opponentScore);
  const finalised = useLiveGame((s) => s.finalised);
  const selectField = useLiveGame((s) => s.selectField);
  const selectBench = useLiveGame((s) => s.selectBench);
  const clearSelection = useLiveGame((s) => s.clearSelection);
  const applySwap = useLiveGame((s) => s.applySwap);
  const applyInjurySwap = useLiveGame((s) => s.applyInjurySwap);
  const applyFieldZoneSwap = useLiveGame((s) => s.applyFieldZoneSwap);
  const addBenchPlayer = useLiveGame((s) => s.addBenchPlayer);
  const incTeam = useLiveGame((s) => s.incTeam);
  const incOpponent = useLiveGame((s) => s.incOpponent);
  const incPlayerScore = useLiveGame((s) => s.incPlayerScore);
  const undoTeamScore = useLiveGame((s) => s.undoTeamScore);
  const undoOpponentScore = useLiveGame((s) => s.undoOpponentScore);
  const undoPlayerScore = useLiveGame((s) => s.undoPlayerScore);
  const playerScores = useLiveGame((s) => s.playerScores);
  const startClock = useLiveGame((s) => s.startClock);
  const pauseClock = useLiveGame((s) => s.pauseClock);
  const beginNextQuarter = useLiveGame((s) => s.beginNextQuarter);
  const endCurrentQuarter = useLiveGame((s) => s.endCurrentQuarter);
  const basePlayedZoneMs = useLiveGame((s) => s.basePlayedZoneMs);
  const stintStartMs = useLiveGame((s) => s.stintStartMs);
  const stintZone = useLiveGame((s) => s.stintZone);
  const swapCount = useLiveGame((s) => s.swapCount);
  const injuredIds = useLiveGame((s) => s.injuredIds);
  const setInjured = useLiveGame((s) => s.setInjured);
  const loanedIds = useLiveGame((s) => s.loanedIds);
  // Display caps for the on-field grid — how many slots each zone draws.
  // Normally the age-group DEFAULT, so a coach who reduced on-field size
  // (e.g. 15→13) still sees the missing positions as "Empty" placeholder
  // tiles (Steve 2026-05-20). BUT a genuinely short squad — fewer healthy
  // players present than the default — shouldn't see phantom slots for
  // kids who aren't there: it makes the live field disagree with the
  // shape-preserving Q-break, and invites filling a slot that can't be
  // filled. So the display size is capped at the number of AVAILABLE
  // players; when that's below the default, we collapse to the coach's
  // actual zone shape instead of the default fill. Full squads (available
  // ≥ default) are unchanged — the reduced-size affordance is preserved.
  // Steve 2026-07-07. The suggester itself only ever swaps 1:1, so this
  // is purely about the rendered slot count.
  const displayZoneCaps = useMemo(() => {
    const inj = new Set(injuredIds);
    const loan = new Set(loanedIds);
    const present = new Set<string>([
      ...activeZones.flatMap((z) => lineup[z]),
      ...lineup.bench,
    ]);
    let available = 0;
    present.forEach((id) => {
      if (!inj.has(id) && !loan.has(id)) available += 1;
    });
    return effectiveDisplayZoneCaps(
      lineup,
      available,
      defaultOnFieldSize,
      positionModel,
    );
  }, [lineup, activeZones, injuredIds, loanedIds, defaultOnFieldSize, positionModel]);
  const loanStartMs = useLiveGame((s) => s.loanStartMs);
  const basePlayedLoanMs = useLiveGame((s) => s.basePlayedLoanMs);
  const setLoaned = useLiveGame((s) => s.setLoaned);
  const lockedIds = useLiveGame((s) => s.lockedIds);
  const setLocked = useLiveGame((s) => s.setLocked);
  const zoneLockedPlayers = useLiveGame((s) => s.zoneLockedPlayers);
  const setZoneLocked = useLiveGame((s) => s.setZoneLocked);
  const lastStintZone = useLiveGame((s) => s.lastStintZone);

  const activeGameId = useLiveGame((s) => s.activeGameId);

  // Plan-ahead rotation (F1): the coach's pinned upcoming-sub plan plus
  // its setter/clearer. Persisted by the store, keyed to this game.
  const plannedRotation = useLiveGame((s) => s.plannedRotation);
  const setPlannedRotation = useLiveGame((s) => s.setPlannedRotation);

  const walkthroughSteps = useMemo(() => buildWalkthroughSteps(trackScoring), [trackScoring]);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  // The clock pill opens the clock menu (pause / resume / end now).
  const [clockMenuOpen, setClockMenuOpen] = useState(false);

  const [hydrated, setHydrated] = useState(false);
  // Tracks whether the init effect has populated the store for this
  // gameId during the current mount lifetime. Used to differentiate:
  //   - FRESH MOUNT (page load, hard reload, test page.goto):
  //     ref is null → init() auto-resumes the clock from the
  //     server's quarterStartedAt timestamp. No modal — coach can
  //     get straight back to running the game after a reload.
  //   - Q-BREAK → NEXT QUARTER (component stays mounted, router
  //     .refresh() pipes in new initialState): ref already matches
  //     this gameId → init() leaves clockStartedAt null. The
  //     kickoffAck modal stays up so the coach has to tap Start
  //     Q{n} on the umpire's whistle. Steve's 2026-05-10 fix lives
  //     here in spirit; the original mid-quarter reload regression
  //     was the auto-progression bug only AFTER a Q-break advance,
  //     not on every page load.
  const initedGameIdRef = useRef<string | null>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [subBaseMs, setSubBaseMs] = useState<number | null>(null);
  // Swaps made on this phone, stamped in the replay's absolute game-ms
  // frame. The recency guard's lastSubbedOn/OffMs come from the server
  // replay, which a mid-quarter swap doesn't refresh — so without these
  // the kid just swapped off was suggested straight back on (round 5).
  const [localSubbedMs, setLocalSubbedMs] = useState<{
    on: Record<string, number>;
    off: Record<string, number>;
  }>({ on: {}, off: {} });
  const [pendingSwap, setPendingSwap] = useState<{ off: string; on: string; zone: Zone } | null>(null);
  // An empty spot tapped with nobody selected: pick who comes on there
  // (the break does the same). It used to do nothing, so after lending a
  // kid mid-quarter the gap couldn't be filled from the spot (Stagehand
  // round 4).
  const [fillZone, setFillZone] = useState<Zone | null>(null);
  const [, setTick] = useState(0);
  const prevSubStateRef = useRef<"idle" | "soft" | "due">("idle");
  const [subDueOpen, setSubDueOpen] = useState(false);
  // Plan-ahead rotation (F1): true while the shared planner is open over
  // the live game so the coach can edit the upcoming sub before it falls
  // due. Pinning closes it.
  // F2 (ROTPLAN-02): the "plan NEXT period" planner, opened in the dying
  // minutes of the current period. Reuses the SAME shared GamePlanModal,
  // just opened on the next period's tab. Pinning closes it.
  const [planNextOpen, setPlanNextOpen] = useState(false);
  const [showQuarterEndModal, setShowQuarterEndModal] = useState(false);
  const quarterEndTriggeredRef = useRef<number | null>(null);
  // Bumped from the hooter trigger below so GameHeader's clock pill
  // halos with the brand siren pulse exactly when the quarter ends.
  // Initial null suppresses the pulse on first render (a fresh page
  // load shouldn't auto-pulse — only sirenic moments should).
  // Mirrors NetballLiveGame's clockPulseKey state.
  const [clockPulseKey, setClockPulseKey] = useState<number | null>(null);
  // Bumped when the game transitions from pre-kickoff → Q1 running.
  // Fires a one-shot brand halo around the field perimeter via
  // Field's `wakeUpKey` prop. Stays null on every fresh page load
  // — the halo only fires on a real transition, not on re-mount of
  // the live view. P1.5-5 in MICRO-INTERACTIONS-PLAN.md.
  const [fieldWakeUpKey, setFieldWakeUpKey] = useState<number | null>(null);
  const prevIsPreGameRef = useRef<boolean | null>(null);
  const [lockModal, setLockModal] = useState<{ playerId: string; zone: Zone | null } | null>(null);
  // When set, the coach is choosing a replacement for an on-field player about
  // to be marked injured. Null means no picker open.
  const [injuryReplacementModal, setInjuryReplacementModal] = useState<{
    injuredId: string;
    zone: Zone;
  } | null>(null);

  // Undo-score state
  const [lastScore, setLastScore] = useState<LastScore | null>(null);
  const [undoToastVisible, setUndoToastVisible] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Swap-done toast — confirms that a substitution landed.
  const [swapToast, setSwapToast] = useState<string | null>(null);
  const swapToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the coach taps the own-team `+G`/`+B` chip in the
  // scorebug header, this is set to the kind of score they're
  // attributing. Open ↔ SlotFillSheet visible. The coach picks a
  // player; we then run the same score-recording path as the
  // tap-player-then-tap-+G flow. Stagehand exploration found that
  // a fresh runner expects symmetric +G/+B controls per team, so
  // we route through this picker rather than forcing them to
  // discover the long-press / tap-tile path first. Nullable.
  const [pickScorerKind, setPickScorerKind] = useState<"goal" | "behind" | null>(null);

  // When the coach taps "Sub off" in the action drawer for a
  // currently-selected field player, this captures their slot so
  // the bench picker knows where to swap into. Stagehand 2026-05-09
  // (afl-u8-auskick) found the action drawer surfaces only "+ Goal"
  // / "+ Behind" / "Cancel" when track_scoring=true — the
  // tap-a-bench-player-to-swap path is invisible. An Auskick coach
  // (where rotation > scoring) interpreted the drawer as
  // scoring-only and gave up. Adding an explicit "Sub off" button
  // surfaces the substitution path. On pick → setPendingSwap fires
  // the same swap-confirm dialog as the tap-bench flow.
  const [subOffSelected, setSubOffSelected] = useState<{ playerId: string; zone: Zone } | null>(null);

  // Modal-open state for the quarter-by-quarter score breakdown.
  // Triggered from the "Q-by-Q" chip under the clock pill. The
  // modal renders a richer view (table + cumulative running
  // totals + lead/margin per quarter) than the always-visible
  // QuarterScoreStrip below the scorebug.
  const [quarterScoresOpen, setQuarterScoresOpen] = useState(false);

  // Team song — extracted to the shared `useHypeSong` hook
  // 2026-05-16 so netball can use the same playback path. Hook
  // owns the YT iframe + audio fallback + auto-stop timer; we
  // just render the hidden container ref below and call playSong()
  // on goal commit.
  const { playSong, primeSong } = useHypeSong({
    songUrl,
    songStartSeconds,
    songDurationSeconds,
    hydrated,
    gameId,
  });

  const playersById = useMemo(
    () => new Map(squadPlayers.map((p) => [p.id, p])),
    [squadPlayers]
  );

  // The walkthrough never auto-opens here: LiveGame mounts at Start Q1,
  // so a first-visit auto-open landed over a running clock (UX plan
  // H1). It's offered before kickoff (WalkthroughOffer on the lineup
  // screen) and the "?" in the top bar opens it on demand.
  function handleWalkthroughClose() {
    localStorage.setItem("gm-walkthrough-seen", "1");
    setWalkthroughOpen(false);
  }

  function handleOpenWalkthrough() {
    setWalkthroughOpen(true);
  }

  useEffect(() => {
    if (!initialState.lineup) return;
    // Skip re-init when the store is already in sync with the server's view
    // of the game. After a `resetGame` deletes every event, the server's
    // currentQuarter regresses to 0 — but quarters can only ever advance
    // during normal play. So if the store thinks we're further along than
    // the server says, the game has been reset and we MUST re-init to
    // wipe accumulated zone minutes, scores, locks, and so on. Without
    // this check, restart-game just left the in-memory state from before
    // the reset visible on screen.
    //
    // Read the store's currentQuarter via getState() rather than the
    // selector subscription so this effect is NOT re-triggered by normal
    // forward progress (Start Q1, Start Q2, …). That mistake caused a
    // regression where the user had to tap "Start Qn" twice: the first
    // tap advanced the store, the effect re-fired before initialState
    // had refreshed, storeAheadOfServer was true, and init() reset the
    // store back to the pre-tap state. The legitimate trigger for re-init
    // is initialState changing — that's already in the dep array.
    const fullStoreState = useLiveGame.getState();
    const storeQuarter = fullStoreState.currentQuarter;
    const storeAheadOfServer = storeQuarter > initialState.currentQuarter;
    // Phase 5c: after a force-quit, the persist middleware
    // rehydrates `activeGameId` (plus a few in-memory-only fields
    // like lockedIds) but NOT the server-replayable bits — lineup
    // is empty defaults, scores are 0, currentQuarter is 0. The
    // skip below was designed for a fully populated store; without
    // this guard, a rehydrated session would skip init and the
    // user would see an empty lineup. Treat "lineup has any player
    // anywhere" as the signal that init has actually run in this
    // session.
    const lineupHasAnyPlayer =
      fullStoreState.lineup.bench.length > 0 ||
      ALL_ZONES.some((z) => fullStoreState.lineup[z].length > 0);
    // Read activeGameId from the live store (not the selector closure)
    // so the check sees the just-committed init from a sibling effect
    // run in the same tick. Without this, React 18 dev-mode strict
    // mount + persist-rehydration can queue two effect runs both
    // capturing `activeGameId === null` in their closures; the
    // second run then falls through and re-inits with
    // clockStartedAt=null, silently pausing the freshly-started
    // clock. Steve 2026-05-20 demo clock-auto-resume fix.
    if (
      fullStoreState.activeGameId === gameId &&
      !storeAheadOfServer &&
      lineupHasAnyPlayer
    ) {
      setHydrated(true);
      return;
    }
    // Differentiate fresh page load from Q-break advance using a
    // ref that only flips once per component mount. The Q-break →
    // next quarter transition re-runs this effect via router.refresh
    // WITHOUT remounting LiveGame, so the ref persists and tells us
    // not to auto-resume. A real page reload remounts; ref starts
    // null; we auto-resume the clock from the server's
    // quarterStartedAt and skip the kickoff modal.
    const isFreshMount = initedGameIdRef.current !== gameId;
    initedGameIdRef.current = gameId;

    let clockStartedAt: number | null = null;
    let accumulatedMs = 0;
    if (
      !initialState.quarterEnded &&
      !initialState.finalised &&
      initialState.currentQuarter >= 1 &&
      initialState.quarterStartedAt
    ) {
      // Game ms, the frame the replay's stint stamps are in.
      accumulatedMs =
        Math.max(0, Date.now() - new Date(initialState.quarterStartedAt).getTime()) *
        clockMultiplier;
      // Auto-resume only on a fresh mount. On a Q-break advance
      // (same mount, new initialState), Steve's intent stands:
      // leave clockStartedAt null so the StartQuarterModal blocks
      // until the coach taps Start. Page reload / test seed /
      // hard-refresh hit the fresh-mount branch and get the
      // clock running immediately, matching the pre-70fda29
      // behaviour for those flows.
      if (isFreshMount) {
        clockStartedAt = Date.now();
      }
    }
    init({
      activeGameId: gameId,
      lineup: initialState.lineup,
      currentQuarter: initialState.currentQuarter,
      quarterEnded: initialState.quarterEnded,
      finalised: initialState.finalised,
      teamScore: initialState.teamScore,
      opponentScore: initialState.opponentScore,
      scoreByQuarter: initialState.scoreByQuarter,
      playerScores: initialState.playerScores,
      basePlayedZoneMs: initialState.basePlayedZoneMs,
      // Bug fix 2026-05-09: previously omitted from init, which
      // meant the live store's lastStintZone was {} on every
      // hydrate (cold mount, router.refresh after period_break_swap,
      // tab-switch reload). The suggester's same-zone-as-last-
      // quarter penalty silently no-op'd, leaving players parked
      // in identical zones two quarters running. Replay now
      // computes this at every quarter_end so we just thread it
      // through.
      lastStintZone: initialState.lastStintZone,
      // Per-player per-quarter zone history (Steve 2026-05-13).
      // Same replay-from-events path as lastStintZone; threaded
      // through here so the QB tiles can render the per-quarter bar.
      pastQuarterZones: initialState.pastQuarterZones,
      stintStartMs: initialState.stintStartMs,
      stintZone: initialState.stintZone,
      injuredIds: initialState.injuredIds,
      loanedIds: initialState.loanedIds,
      loanStartMs: initialState.loanStartMs,
      basePlayedLoanMs: initialState.basePlayedLoanMs,
      // Saved holds win over this phone's copy once the game has any.
      ...(initialState.locks ? aflStoreLocks(initialState.locks) : {}),
      clockStartedAt,
      accumulatedMs,
      clockMultiplier,
    });
    setHydrated(true);
  }, [init, initialState, gameId, activeGameId, clockMultiplier]);

  /** Game ms into this quarter: the frame of events, the replay and the store. */
  function currentElapsedMs() {
    return clockElapsedMs({ clockStartedAt, accumulatedMs, clockMultiplier });
  }

  useEffect(() => {
    if (clockStartedAt === null) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [clockStartedAt]);

  useEffect(() => {
    if (currentQuarter >= 1 && !quarterEnded && !finalised) {
      // Issue 4: seed the sub-interval start by FLOORING the current
      // clock elapsed onto the interval grid, not to "now". The main
      // clock recomputes correctly on remount (persisted timestamp), so
      // the floor is identical before/after a remount — the countdown
      // resumes from where it was instead of resetting to a full
      // interval. Both sides are game ms.
      setSubBaseMs(
        subIntervalStartFloor({ nowMs: currentElapsedMs(), intervalMs: subIntervalMs }),
      );
    } else {
      setSubBaseMs(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuarter, quarterEnded, finalised]);

  function handleTapField(playerId: string, zone: Zone) {
    if (isFinished) return;
    if (playerId === "") {
      if (selected?.kind === "bench") {
        clearSelection();
        setPendingSwap({ off: "", on: selected.playerId, zone });
        return;
      }
      // Field player selected + empty slot tapped → MOVE the player
      // to the empty slot. Source zone becomes the new blank. Lets
      // a coach playing short-squad shift the blank zone mid-game
      // without going via bench (e.g. send a Back into an empty
      // Forward, blank moves to Backs). Same-zone is a no-op — the
      // player would just land where they already are.
      if (selected?.kind === "field" && selected.zone !== zone) {
        const pidA = selected.playerId;
        const zoneA = selected.zone;
        const quarter = Math.max(1, currentQuarter);
        const elapsed_ms = currentElapsedMs();
        clearSelection();
        applyFieldZoneSwap(pidA, zoneA, "", zone);
        showSwapToast(`${shortName(pidA)} → ${ZONE_LABELS[zone]}`);
        enqueueLiveAction("recordFieldZoneSwap", [
          auth,
          gameId,
          {
            player_a_id: pidA,
            zone_a: zoneA,
            player_b_id: null,
            zone_b: zone,
            quarter,
            elapsed_ms,
          },
        ]);
        return;
      }
      if (!selected) setFillZone(zone);
      return;
    }
    if (!selected) {
      selectField(playerId, zone);
      return;
    }
    if (selected.kind === "field" && selected.playerId === playerId) {
      clearSelection();
      return;
    }
    if (selected.kind === "bench") {
      clearSelection();
      setPendingSwap({ off: playerId, on: selected.playerId, zone });
      return;
    }
    // Two different field players in different zones — swap their zones directly.
    if (selected.zone !== zone) {
      const pidA = selected.playerId;
      const zoneA = selected.zone;
      const quarter = Math.max(1, currentQuarter);
      const elapsed_ms = currentElapsedMs();
      applyFieldZoneSwap(pidA, zoneA, playerId, zone);
      showSwapToast(
        `${shortName(pidA)} ⇄ ${shortName(playerId)} — zones swapped`
      );
      enqueueLiveAction("recordFieldZoneSwap", [
        auth,
        gameId,
        {
          player_a_id: pidA,
          zone_a: zoneA,
          player_b_id: playerId,
          zone_b: zone,
          quarter,
          elapsed_ms,
        },
      ]);
      return;
    }
    selectField(playerId, zone);
  }

  function handleTapBench(playerId: string) {
    if (isFinished) return;
    if (!selected) {
      selectBench(playerId);
      return;
    }
    if (selected.kind === "bench" && selected.playerId === playerId) {
      clearSelection();
      return;
    }
    if (selected.kind === "field") {
      clearSelection();
      setPendingSwap({ off: selected.playerId, on: playerId, zone: selected.zone });
      return;
    }
    selectBench(playerId);
  }

  function startUndoToast(score: LastScore) {
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    setLastScore(score);
    setUndoToastVisible(true);
    undoTimerRef.current = setTimeout(() => setUndoToastVisible(false), 8000);
  }

  function shortName(playerId: string): string {
    const p = playersById.get(playerId);
    if (!p) return "Player";
    const [first] = p.full_name.trim().split(/\s+/);
    return first ?? p.full_name;
  }

  function showSwapToast(text: string) {
    if (swapToastTimerRef.current !== null) clearTimeout(swapToastTimerRef.current);
    setSwapToast(text);
    swapToastTimerRef.current = setTimeout(() => setSwapToast(null), 2500);
    // Light haptic tap on mobile — confirms the swap landed. Goes
    // via the haptics primitive so iOS users get a real Taptic tap
    // instead of the silent navigator.vibrate no-op WebKit ships.
    // Fire-and-forget: don't block the toast render on the bridge.
    void hapticTap("light");
  }

  // Core score-recording path. Shared by:
  //   • handleScore() — the existing tap-player-tile + tap "+ Goal"
  //     flow (uses `selected` from the live store).
  //   • the +G/+B picker on the scorebug — tap chip → pick scorer
  //     in SlotFillSheet → fires this directly with the picked id.
  // Optimistic store updates + undo-toast wiring live here so both
  // paths get them for free.
  function recordPlayerScore(playerId: string, kind: "goal" | "behind") {
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    const p = playersById.get(playerId);
    incTeam(kind === "goal" ? "goals" : "behinds");
    incPlayerScore(playerId, kind === "goal" ? "goals" : "behinds");
    if (kind === "goal") playSong();
    // Light haptic tap — confirms the score recorded. P1-10 in
    // MICRO-INTERACTIONS-PLAN.md. The plan flagged a tap-tap-tap
    // scoring burst (three behinds in quick succession) as a
    // potential annoyance vector — if it reads as too busy on
    // iPhone, gate to `kind === "goal"` only. Defaulting to both
    // for now because light haptic is gentle and a behind is
    // worth acknowledging too.
    void hapticTap("light");
    startUndoToast({
      kind,
      forTeam: "us",
      playerId,
      playerName: p ? p.full_name.trim().split(/\s+/)[0] : null,
      quarter,
    });
    enqueueLiveAction(kind === "goal" ? "recordGoal" : "recordBehind", [
      auth,
      gameId,
      { player_id: playerId, quarter, elapsed_ms },
    ]);
  }

  // Unattributed goal: the coach saw it go through but not who kicked
  // it (scrum in front of goal, watching a swap, etc). Mirrors the
  // rushed-behind mechanism — counts +1 for our team, skips the
  // per-player tally — but the song still plays: it's still our goal.
  // Steve 2026-07-08 (UX review #5): the old "every goal has a scorer"
  // assumption cost the whole goal when the coach hit Cancel.
  function recordUnattributedGoal() {
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    incTeam("goals");
    playSong();
    void hapticTap("light");
    startUndoToast({
      kind: "goal",
      forTeam: "us",
      playerId: null,
      playerName: null,
      quarter,
    });
    enqueueLiveAction("recordGoal", [
      auth,
      gameId,
      { player_id: null, quarter, elapsed_ms, unattributed: true },
    ]);
  }

  // Rushed behind: ball deflects through off the opposition (or
  // self-rushed). Counts +1 for our team but has no scorer, so it
  // skips the per-player tally and never plays the goal song.
  function recordRushedBehind() {
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    incTeam("behinds");
    startUndoToast({
      kind: "behind",
      forTeam: "us",
      playerId: null,
      playerName: null,
      quarter,
    });
    enqueueLiveAction("recordBehind", [
      auth,
      gameId,
      { player_id: null, quarter, elapsed_ms, rushed: true },
    ]);
  }

  function handleScore(kind: "goal" | "behind") {
    if (!selected || selected.kind !== "field") return;
    const playerId = selected.playerId;
    clearSelection();
    recordPlayerScore(playerId, kind);
  }

  function handleInjuryToggle(playerId: string, injured: boolean) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    setInjured(playerId, injured);
    enqueueLiveAction("markInjury", [
      auth,
      gameId,
      { player_id: playerId, injured, quarter, elapsed_ms },
    ]);
  }

  // Combined injury + bench-replacement swap. Used when the coach picks a
  // replacement in InjuryReplacementModal — fires the atomic store action
  // and persists both events to the server (injury + swap) in parallel.
  // Mirrors persistSwap's sub-timer reset so the next sub-due alert fires
  // a fresh interval after the forced rotation.
  function handleInjuryReplacement(
    injuredId: string,
    replacementId: string,
    zone: Zone
  ) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    // Issue 5: a forced injury/lent replacement is off-cadence — it must
    // NOT reset the sub countdown. Leave subBaseMs alone so the timer
    // keeps running toward the next scheduled rotation. (Was
    // setSubBaseMs(currentElapsedMs()) here.)
    applyInjurySwap(injuredId, replacementId);
    // Two queue ops, dispatched in order. The queue's FIFO contract
    // means the injury event lands before the swap on the server,
    // mirroring the prior Promise.all semantics where both fired
    // concurrently but the replay engine handles either ordering.
    enqueueLiveAction("markInjury", [
      auth,
      gameId,
      {
        player_id: injuredId,
        injured: true,
        quarter,
        elapsed_ms,
      },
    ]);
    enqueueLiveAction("recordSwap", [
      auth,
      gameId,
      {
        off_player_id: injuredId,
        on_player_id: replacementId,
        zone,
        quarter,
        elapsed_ms,
      },
    ]);
  }

  function handleLoanToggle(playerId: string, loaned: boolean) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    setLoaned(playerId, loaned);
    enqueueLiveAction("markLoan", [
      auth,
      gameId,
      { player_id: playerId, loaned, quarter, elapsed_ms },
    ]);
  }

  // Holds are saved (player_lock) so a reload or a co-manager's
  // phone keeps them; the store update above stays instant.
  function saveLock(playerId: string, lock: PlayerLock | null) {
    enqueueLiveAction("recordPlayerLock", [
      auth,
      gameId,
      { player_id: playerId, lock, quarter: Math.max(1, currentQuarter), elapsed_ms: currentElapsedMs() },
    ]);
  }

  function handleLateArrival(playerId: string) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    addBenchPlayer(playerId);
    enqueueLiveAction("addLateArrival", [
      auth,
      gameId,
      { player_id: playerId, quarter, elapsed_ms },
    ]);
  }

  function handleOpponent(kind: "goal" | "behind") {
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    incOpponent(kind === "goal" ? "goals" : "behinds");
    startUndoToast({ kind, forTeam: "opponent", playerId: null, playerName: null, quarter });
    enqueueLiveAction("recordOpponentScore", [
      auth,
      gameId,
      { kind, quarter, elapsed_ms },
    ]);
  }

  function handleUndo() {
    if (!lastScore) return;
    const { kind, forTeam, playerId, quarter } = lastScore;

    if (forTeam === "us") {
      undoTeamScore(kind === "goal" ? "goals" : "behinds");
      if (playerId) undoPlayerScore(playerId, kind === "goal" ? "goals" : "behinds");
    } else {
      undoOpponentScore(kind === "goal" ? "goals" : "behinds");
    }

    setLastScore(null);
    setUndoToastVisible(false);
    if (undoTimerRef.current !== null) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    const serverKind: "goal" | "behind" | "opponent_goal" | "opponent_behind" =
      forTeam === "us"
        ? kind
        : kind === "goal" ? "opponent_goal" : "opponent_behind";

    // On the game's write-queue lane, so it can't overtake its score.
    const { flushed } = enqueueLiveAction("undoLastScore", [
      auth,
      gameId,
      { kind: serverKind, quarter, playerId: playerId ?? null },
    ]);
    flushed.catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't undo that score."));
  }

  // `resetSubTimer` = was this the PLANNED rotation tick? A scheduled
  // rotation (the suggested-swap apply) resets the countdown to a full
  // interval (issue 5). A deliberate off-cadence manual swap leaves it
  // running toward the next scheduled rotation (issue 5 open question,
  // default "keep running"). Forced injury/lent swaps go through their
  // own path and never reset.
  function persistSwap(
    off: string,
    on: string,
    zone: Zone,
    resetSubTimer = true,
  ) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    if (resetSubTimer) setSubBaseMs(elapsed_ms);
    const at = initialState.completedQuarterMs + elapsed_ms;
    setLocalSubbedMs((prev) => ({
      on: { ...prev.on, [on]: at },
      off: { ...prev.off, [off]: at },
    }));
    applySwap(off, on, zone);
    enqueueLiveAction("recordSwap", [
      auth,
      gameId,
      {
        off_player_id: off,
        on_player_id: on,
        zone,
        quarter,
        elapsed_ms,
      },
    ]);
  }

  // handleStartFirstQuarter removed (Steve 2026-05-13): the kickoff
  // modal that called it now lives inside LineupPicker, which
  // commits lineup_set + quarter_start atomically via
  // startGame(..., startQuarterToo=true). When LiveGame mounts
  // afterwards, init()'s fresh-mount auto-resume branch picks up
  // the quarter_start timestamp and starts the clock. No
  // separate handler needed here.

  function handlePause() {
    pauseClock();
  }

  function handleResume() {
    // Mirror of netball's handleClockTap gate (NetballLiveGame.tsx
    // ~L270): once the auto-hooter has fired for this quarter the
    // clock is locked — tapping the pill to resume would re-start
    // player-time accrual after the quarter is already over (just
    // waiting on the GM to confirm via the QuarterEndModal). The
    // hooter's pauseClock() is the freeze anchor; the resume path
    // shouldn't be able to break it. Steve 2026-05-15 directive:
    // "apply the same rules globally" — both sports now share the
    // same hooter-fired-locks-resume invariant.
    if (quarterEndTriggeredRef.current === currentQuarter) return;
    startClock();
  }

  function handleEndQuarter(opts?: { creditFullQuarter?: boolean }) {
    setError(null);
    const q = currentQuarter;
    // Auto-hooter path uses the actual game-clock elapsed.
    // Manual "End quarter early" path (Steve's real-game scenario:
    // clock paused at the start of the quarter, forgot to resume,
    // game continued anyway) credits on-field players the full
    // quarter — what they actually played, not what the clock saw.
    // Capped at the quarter length, as the store caps it: a quarter the
    // phone wasn't watching when the siren went (asleep, reloaded) would
    // otherwise save the whole overrun and credit every kid on the field
    // minutes they never played.
    const elapsed_ms = opts?.creditFullQuarter
      ? quarterMs
      : Math.min(currentElapsedMs(), quarterMs);
    endCurrentQuarter(quarterMs, opts);
    const { flushed } = enqueueLiveAction("endQuarter", [
      auth,
      gameId,
      q,
      elapsed_ms,
    ]);
    // Chain refresh after the queue flushes so SSR sees the
    // quarter_end event and renders the Q-break shell (or
    // finalised state for Q4). Without this, refresh races the
    // queue and the page re-mounts with stale server state.
    // Wrap router.refresh in startTransition so the route's
    // loading.tsx Suspense fallback DOESN'T flash during the
    // refetch — React preserves the existing UI during a
    // transition even if the underlying data suspends. Steve
    // 2026-05-13: the Q-end + end-game "weird screen refresh /
    // white flash a few seconds after" was the loading.tsx
    // skeleton briefly replacing the live tree during the
    // post-flush refresh.
    flushed.then(() => startTransition(() => router.refresh()));
  }

  function handleQuarterEndConfirm() {
    setShowQuarterEndModal(false);
    handleEndQuarter();
  }

  // Manual "End quarter early" — opens a confirm dialog rather
  // than firing immediately. The action is destructive (writes a
  // quarter_end event with full-credit elapsed_ms; on Q4 it
  // transitions to FT review) so requiring an extra tap keeps a
  // misclick from blowing up a real game.
  const [showManualEndConfirm, setShowManualEndConfirm] = useState(false);

  const running = clockStartedAt !== null;
  const isPreGame = currentQuarter === 0;
  // Detect the pre-game → Q1 transition. The first effect run
  // captures the initial isPreGame value (null → current) without
  // firing; subsequent runs check for an actual transition. Skipping
  // first-mount is essential — a freshly-mounted live view with
  // currentQuarter=1 (page reload mid-game) would otherwise pulse
  // every time the coach navigates back to /live.
  useEffect(() => {
    if (prevIsPreGameRef.current === true && !isPreGame) {
      setFieldWakeUpKey((k) => (k === null ? 1 : k + 1));
    }
    prevIsPreGameRef.current = isPreGame;
  }, [isPreGame]);
  // Full time has TWO phases: REVIEW (Q4 ended, not yet finalised)
  // and FINISHED (game_finalised event fired). Review shows a
  // FullTimeReview panel where the coach can fix scores; tapping
  // "Finalise game" writes game_finalised → flips us to FINISHED →
  // GameSummaryCard takes over. `isFinished` covers BOTH phases for
  // UI-suppression purposes (no more SwapCard / scoring buttons /
  // start-quarter modal once Q4 is over). The summary itself
  // renders only when `finalised` is true.
  const { isAtFullTime, isBetweenPeriods: isBetweenQuarters, isLastPeriod }
    = periodPhase(currentQuarter, ageGroup.periodCount, quarterEnded, finalised);
  const isFinished = finalised || isAtFullTime;

  // Kickoff modal state used to live here (startModalDismissed +
  // kickoffAckQuarter + the per-quarter reset effect). Removed
  // Steve 2026-05-13: the await-kickoff modal is now owned by
  // LineupPicker (Q1) and QuarterBreak (Q-break), and commits both
  // writes atomically before LiveGame's init auto-resume kicks the
  // clock. There's nothing left for LiveGame to ack or dismiss.

  // Scroll to the top of the page (= top of the scorebug) when a
  // new quarter goes live. Without this the page inherits the
  // scroll position from the Q-break (often scrolled deep into the
  // rotation chips / lineup grid / score panel) and the coach
  // lands mid-page just as the action restarts. Steve's UX bug
  // 2026-05-09. Only fires when transitioning INTO live play
  // (currentQuarter > 0 AND !quarterEnded), not on the initial
  // pre-game render.
  useEffect(() => {
    if (currentQuarter < 1 || quarterEnded || finalised) return;
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentQuarter, quarterEnded, finalised]);

  // Unlock the sub-due beep's AudioContext on the first tap (shared
  // with league and union; see subDueBeep.ts).
  useSubDueAudioUnlock();

  // Game ms, like quarterMs and every stint stamp.
  const nowMs = currentElapsedMs();
  const displayNowMs = Math.min(nowMs, quarterMs);

  const zoneMsByPlayer: Record<string, ZoneMinutes> = {};
  for (const [pid, zm] of Object.entries(basePlayedZoneMs)) {
    zoneMsByPlayer[pid] = { ...zm };
  }
  for (const [pid, start] of Object.entries(stintStartMs)) {
    const z = stintZone[pid];
    if (!z) continue;
    zoneMsByPlayer[pid] ??= emptyZoneMs();
    zoneMsByPlayer[pid][z] += Math.max(0, displayNowMs - start);
  }
  const totalMsByPlayer: Record<string, number> = {};
  for (const [pid, zm] of Object.entries(zoneMsByPlayer)) {
    let t = 0;
    for (const z of ALL_ZONES) t += zm[z];
    totalMsByPlayer[pid] = t;
  }

  // The sub-due cadence is the coach's CONFIGURED interval
  // (games.sub_interval_seconds, defaulted to the age-group value, e.g.
  // U10 = 3 min). The reminders sit on a fixed grid anchored to the
  // period start (subBaseMs is floored onto that grid — see the seed
  // effect), so they "line up to period lengths" (3-min interval in a
  // 12-min quarter → 3/6/9) AND honour exactly what the coach set.
  //
  // History: this briefly derived the interval from a `subs_per_quarter`
  // count (quarterMs/(N+1)), but that IGNORED the configured interval and
  // produced surprising values (U15 4-min setting → 5-min cadence). The
  // configured interval is the single source of truth again; the
  // subs_per_quarter column was dropped (migration 0065).
  const subIntervalMs = subIntervalSeconds * 1000;
  // F2 "final minutes" gate (D-11): the coach can plan the NEXT period once
  // the current one enters its final rotation window — i.e. less than one
  // sub interval remains before the hooter. Derived purely from the live
  // clock (nowMs / quarterMs / the sub cadence), never a hardcoded period
  // count; periodPhase.isLastPeriod hides it on the final period (no next
  // period to plan). Same clock frame as msUntilDue/subPastHooter below.
  const inFinalWindow = isFinalSubWindow({
    nowMs,
    quarterMs,
    effectiveSubIntervalMs: subIntervalMs,
  });
  const msUntilDue =
    subBaseMs !== null && !isPreGame && !isFinished
      ? subBaseMs + subIntervalMs - nowMs
      : null;
  // Steve's real-game scenario: lent a player to the opposition,
  // running 11 on field with the rest of the squad on bench. The
  // sub interval kept ticking, sub-due modal popped up at every
  // window because the time-only check thought a sub was viable.
  // Gate the modal on having an actual healthy bench player to
  // bring on — if everyone on the bench is injured or loaned,
  // there's no rotation to suggest. Same `bench.some(...)`
  // predicate used at the injury-replacement path elsewhere.
  const hasSwappableBench = lineup.bench.some(
    (id) => !injuredIds.includes(id) && !loanedIds.includes(id),
  );
  const subState: "idle" | "soft" | "due" =
    msUntilDue === null
      ? "idle"
      : msUntilDue <= 0 && hasSwappableBench
      ? "due"
      : msUntilDue <= 30000 && hasSwappableBench
      ? "soft"
      : "idle";

  useEffect(() => {
    // Picker-race guard: hold the sub-due alert (beep, haptic,
    // banner) while the score-attribution picker is open, so it
    // doesn't jolt the coach mid-pick. The sub-due state stays "due"
    // while the picker is open — once the coach resolves attribution
    // and the picker closes, the alert fires (subState didn't change,
    // prevSubStateRef is still "due", but we re-check on every render
    // via this effect's deps).
    if (pickScorerKind !== null) return;
    if (subState === "due" && prevSubStateRef.current !== "due") {
      playSubDueBeep();
      // Heavy impact — sub-due is "this needs your attention" but
      // not the urgency of a hooter (which gets hapticSiren below).
      // The medium-vs-heavy distinction is meaningful on iOS Taptic.
      void hapticTap("heavy");
      // P1-12 in MICRO-INTERACTIONS-PLAN.md: stagger the modal
      // open by 130ms so the beep + haptic land first (drawing
      // the coach's attention to the clock + their hand), then
      // the banner slides in. Without the delay, all three events
      // fire on the same frame and read as one undifferentiated
      // jolt. The setTimeout is cancelled by the effect's cleanup
      // if subState or pickScorerKind changes mid-delay.
      prevSubStateRef.current = subState;
      const t = window.setTimeout(() => {
        setSubDueOpen(true);
      }, 130);
      return () => window.clearTimeout(t);
    }
    if (subState !== "due") {
      setSubDueOpen(false);
    }
    prevSubStateRef.current = subState;
  }, [subState, pickScorerKind]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
      if (swapToastTimerRef.current !== null) {
        clearTimeout(swapToastTimerRef.current);
        swapToastTimerRef.current = null;
      }
      // Song / YT cleanup moved into `useHypeSong`'s own return
      // function (Steve 2026-05-16). The hook tears down the
      // iframe + timer on unmount or gameId change.
    };
  }, []);

  function handleSubDueAcknowledge() {
    setSubDueOpen(false);
  }

  useEffect(() => {
    if (quarterEnded || finalised || currentQuarter < 1) return;

    function maybeTrigger() {
      // Picker-race guard: if the score-attribution picker is open
      // (the coach tapped +G/+B and is mid-pick), DON'T fire the
      // auto-hooter. Stagehand explore 2026-05-10 caught the
      // pattern in netball: a goal scored at 11:55 with the picker
      // open got eaten by the 12:00 hooter, the QuarterEndModal
      // covered the picker, attribution was lost. Same race exists
      // in AFL on a long-quarter age-group near the siren. The
      // freeze is conservative — the picker dismisses on pick OR
      // cancel, and the next interval tick fires the hooter once
      // the user resolves attribution.
      if (pickScorerKind !== null) return;
      if (currentElapsedMs() >= quarterMs && quarterEndTriggeredRef.current !== currentQuarter) {
        quarterEndTriggeredRef.current = currentQuarter;
        // Freeze the clock at the hooter so per-player stint times don't keep
        // accruing while the GM reads the modal.
        pauseClock();
        setShowQuarterEndModal(true);
        // Brand pulse on the GameHeader clock pill — re-keys per
        // quarter so each hooter event fires exactly one halo.
        setClockPulseKey(currentQuarter);
        // Siren-pattern haptic. iOS Taptic plays a `Warning`
        // notification (two-pulse "duh-duh"); Android + web fall
        // back to the long-pause-long vibrate cadence that shipped
        // pre-fix. Quarter-end IS a sirenic moment by design.
        void hapticSiren();
      }
    }

    maybeTrigger();
    if (clockStartedAt === null) return;
    const id = setInterval(maybeTrigger, 500);
    return () => clearInterval(id);
  }, [clockStartedAt, accumulatedMs, quarterEnded, finalised, currentQuarter, pickScorerKind]);

  useEffect(() => {
    if (quarterEnded) setShowQuarterEndModal(false);
  }, [quarterEnded]);

  if (!hydrated) return null;

  // In-game top bar — sticky-top, full-width, mirrors the (app)
  // layout header's visual treatment (AppHeaderShell hides the
  // (app) header on /live so this is the sole top chrome). Hoisted
  // out of the main return so the QB branch can render it too —
  // without it, QB content used to butt against the iPhone notch
  // because LiveGame's pre-QB-branch early-return skipped the bar
  // entirely (Steve 2026-05-13). Extracted to LiveTopBar component
  // so the AFL pre-kickoff page can render the same bar.
  const liveTopBar = exitHref ? (
    <LiveTopBar
      exitHref={exitHref}
      game={game}
      isLive={!isPreGame}
      onHelp={handleOpenWalkthrough}
    />
  ) : null;

  // Walkthrough modal — same instance for all branches so the ?
  // button in the top bar works at QB too. Mounted-when-open.
  const walkthroughOverlay = walkthroughOpen ? (
    <WalkthroughModal steps={walkthroughSteps} onClose={handleWalkthroughClose} />
  ) : null;

  if (isBetweenQuarters) {
    return (
      <div className="ui-nonselect">
        {walkthroughOverlay}
        <QuarterBreak
          auth={auth}
          gameId={gameId}
          game={game}
          exitHref={exitHref}
          onHelp={handleOpenWalkthrough}
          ageGroup={ageGroup}
          trackScoring={trackScoring}
          players={squadPlayers}
          season={season}
          seasonAvailability={seasonAvailability}
          zoneCaps={zoneCaps}
          positionModel={positionModel}
          currentOnFieldSize={currentOnFieldSize}
          minOnFieldSize={minOnFieldSize}
          maxOnFieldSize={maxOnFieldSize}
          defaultOnFieldSize={defaultOnFieldSize}
          fullPeriodMs={quarterMs}
          chipModeByKey={chipModeByKey}
          aflPlaybook={aflPlaybook}
          periodCount={ageGroup.periodCount}
          onStarted={() => beginNextQuarter()}
          onPrimeAudio={primeSong}
        />
      </div>
    );
  }

  // Player action sheet (long-press shortcut, or "Player actions" in
  // the tap dock). The zone is where the player is NOW: a bench player
  // has none, even if they played earlier — taking their last stint's
  // zone offered "Keep in Back" on the bench and sent Mark injured down
  // the on-field replacement path.
  function handleLongPress(playerId: string) {
    const zone = activeZones.find((z) => lineup[z].includes(playerId)) ?? null;
    setLockModal({ playerId, zone });
  }

  const rawSuggestions =
    isPreGame || isFinished
      ? []
      : suggestSwaps(
          lineup,
          totalMsByPlayer,
          swapCount,
          // Loaned players are unavailable for rotation, same as injured.
          [...injuredIds, ...loanedIds],
          activeZones,
          lockedIds,
          zoneMsByPlayer,
          zoneLockedPlayers,
          // SUB-01/B4 recency guard. lastSubbedOnMs is the replay-derived
          // ABSOLUTE game-elapsed stamp of each player's most recent
          // bench->field transition (refreshed on every router.refresh
          // after a sub). Compare it against the absolute current game
          // elapsed = completedQuarterMs (finished quarters) + this
          // quarter's game-ms (nowMs). minStintMs is the rotation
          // window, subIntervalMs.
          latestStamps(initialState.lastSubbedOnMs, localSubbedMs.on),
          initialState.completedQuarterMs + nowMs,
          subIntervalMs,
          // ON-side recency guard: keep a just-subbed-off player on the
          // bench for a rest before re-suggesting them (was yo-yoing back
          // on ~1 min later — Steve 2026-06-29).
          latestStamps(initialState.lastSubbedOffMs, localSubbedMs.off),
          aflPlaybook ? { ...aflPlaybook, season, periodMs: quarterMs } : undefined,
        );

  // Hide the SwapCard when the next sub-due moment would fall AFTER
  // the hooter — the suggestion would never fire as a mid-quarter
  // sub, and the same kids tend to cycle in via the QuarterBreak
  // suggester anyway, which made the UI misleading. Steve flagged
  // this on a real game where the SwapCard kept showing "next subs"
  // right up to the hooter without ever firing. When msUntilDue is
  // null (pre-game / between quarters / finished) the SwapCard is
  // already suppressed by other guards, so we leave suggestions
  // alone in that case.
  const subPastHooter =
    msUntilDue !== null &&
    quarterMs > 0 &&
    nowMs + msUntilDue >= quarterMs;
  // Plan-ahead honour (F1): when the coach has pinned an upcoming sub
  // for THIS game + period, honour the pin over the engine pick — but
  // only if every pinned pair is still valid (off on-field, on a
  // swappable bench). A stale/wrong-period/absent pin falls back to the
  // live suggestion (D-09).
  const pinForThisGame =
    plannedRotation && plannedRotation.gameId === activeGameId
      ? plannedRotation
      : null;
  // resolveDisplaySuggestions folds the past-hooter suppression and the
  // pin honour into one pure decision. A pinned sub stays visible past
  // the hooter (so it isn't silently swallowed — it can be applied now
  // or carried to the break); an unpinned suggestion is suppressed once
  // it would fall after the hooter, as before.
  const {
    suggestions,
    pastHooterCarry,
  } = resolveDisplaySuggestions({
    rawSuggestions,
    subPastHooter,
    pin: pinForThisGame,
    currentPeriod: currentQuarter,
    lineup,
    injuredIds,
    loanedIds,
  });
  // F2: a next-period lineup is pinned for THIS game's upcoming period.
  // The upcoming period's 0-based index equals currentQuarter (planning
  // during period P=currentQuarter pins P+1, whose 0-based index is P).
  // Drives the entry label + "planned" badge (D-15).
  const hasPinnedNextPeriod = hasPinnedPeriod(pinForThisGame, currentQuarter);

  const canScore = trackScoring && !isPreGame && !isFinished && selected?.kind === "field";

  function handleClockTap() {
    if (isPreGame || isFinished) return;
    setClockMenuOpen(true);
  }

  // Live-play sticks the scorebug to the bottom of the viewport so
  // the +G / +B chips are always thumb-reachable during a quarter
  // (Steve 2026-05-13). All other states (pre-game, Q-break, FT
  // review, finalised) keep the scorebug at the top — broadcast-
  // scoreboard pattern fits "review the final score" / "set the
  // lineup" framings better than a thumb-reach pattern.
  // isBetweenQuarters short-circuits earlier (the QB component
  // takes over the whole render), so we don't need to check it
  // here.
  const isLivePlay =
    currentQuarter >= 1 && !quarterEnded && !finalised;
  // Whether to offer "Plan Q{n+1}". Available in the final sub window OR
  // once no more subs will churn the lineup this period — including a
  // no-subs game, where it's available throughout (Steve 2026-06-13 ran a
  // no-subs AFL game and couldn't set the next quarter mid-quarter).
  const showPlanNextPeriod = canPlanNextPeriod({
    isLivePlay,
    isLastPeriod,
    inFinalWindow,
    subPastHooter,
    hasSwappableBench,
  });
  const gameHeader = (
    <GameHeader
      teamName={teamName}
      opponentName={opponentName}
      trackScoring={trackScoring}
      onTeam={
        !isPreGame && !isFinished
          ? (kind) => setPickScorerKind(kind)
          : undefined
      }
      onOpponent={!isPreGame && !isFinished ? handleOpponent : undefined}
      onClockTap={handleClockTap}
      running={running}
      isPreGame={isPreGame}
      isFinished={isFinished}
      clockMultiplier={clockMultiplier}
      quarterMs={quarterMs}
      periodCount={ageGroup.periodCount}
      isPending={isPending}
      clockPulseKey={clockPulseKey}
      // Q-by-Q chip surfaces only when there's something to show
      // — i.e. once Q1 is in flight or later. Hidden pre-game and
      // post-FT (the GameSummaryCard handles those views).
      onShowQuarterScores={
        trackScoring && !isPreGame && !isFinished
          ? () => setQuarterScoresOpen(true)
          : undefined
      }
      // Strip the inner card chrome when sticky-bottom (Steve
      // 2026-05-13): the wrapper carries its own bar styling and
      // a card-on-card look reads as bumpy.
      flat={isLivePlay}
    />
  );

  return (
    // 16px section rhythm on the 4/8/16/24/32 scale (design session
    // 17 Oct 2026; was 12).
    <div className="ui-nonselect space-y-4">
      {/* Sub due: the swap card is the one alert (design session 17
          Oct 2026 — one event, one voice). The banner under the bar
          shows only in the rare due moment with no card on screen
          (no renderable suggestion), so there's always exactly one. */}
      {exitHref ? (
        <LiveTopBar
          exitHref={exitHref}
          game={game}
          isLive={!isPreGame}
          onHelp={handleOpenWalkthrough}
          banner={
            subDueBannerShows(subDueOpen, suggestions.length) ? (
              <SubDueBanner onAcknowledge={handleSubDueAcknowledge} />
            ) : null
          }
        />
      ) : null}

      {/* Top-anchored scorebug — only when NOT in live play. During
          live play it gets re-rendered as a fixed bottom bar below
          (search for `isLivePlay && gameHeader`). */}
      {!isLivePlay && gameHeader}

      {/* Quarter-by-quarter modal — drill-down view triggered by
          the chip under the clock pill. Mirrors the glance-level
          QuarterScoreStrip below but with more detail (cumulative
          running totals, per-quarter margin). */}
      {quarterScoresOpen && (
        <QuarterScoreModal
          sport="afl"
          scoreByQuarter={scoreByQuarter}
          currentQuarter={currentQuarter}
          quarterEnded={quarterEnded}
          teamName={teamName}
          opponentName={opponentName}
          onClose={() => setQuarterScoresOpen(false)}
          // Wire fix-scores so coach can unwind a misattributed
          // goal mid-quarter without waiting for the break.
          auth={auth}
          gameId={gameId}
          players={squadPlayers}
        />
      )}

      {/* Swap-done toast — flashes briefly after a substitution lands
          (the shared SwapDoneToast, an overlay that doesn't push the
          field down). */}
      {swapToast && !isPreGame && !isFinished && <SwapDoneToast text={swapToast} />}

      {/* Undo strip is rendered inside the sticky-bottom bar
          during live play (Steve 2026-05-13). The lastScore +
          isPreGame/isFinished gates apply down there too — when
          conditions fail the strip just doesn't render and the
          sticky bar is shorter. */}

      {isAtFullTime && (
        <FullTimeReview
          auth={auth}
          gameId={gameId}
          trackScoring={trackScoring}
          players={squadPlayers}
          finalisedElapsedMs={accumulatedMs}
        />
      )}

      {finalised && (
        <p className="text-center font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">
          Full time
        </p>
      )}

      {error && (
        <p className="rounded-sm bg-warn-soft px-3 py-2 text-sm text-warn" role="alert">
          {error}
        </p>
      )}

      {/* Field + Bench layout — hidden at full time (Steve
          2026-05-13: the post-Q4 FullTimeReview + GameSummaryCard
          surfaces don't need the on-court layout, it just pads the
          screen with stale state). The IIFE early-returns null
          when isFinished so the SwapCard + Field + Bench fragment
          stays off the FT review and finalised game-summary
          views. Live play and Q-break still get the field. */}
      {!isFinished && (() => {
        const swapOffs = new Map<string, number>();
        const swapOns = new Map<string, { pair: number; zone: Zone }>();
        if (!selected) {
          suggestions.forEach((s, i) => {
            if (s.off_player_id) swapOffs.set(s.off_player_id, i + 1);
            swapOns.set(s.on_player_id, { pair: i + 1, zone: s.zone });
          });
        }
        const totalPairs = suggestions.length;
        return (
          <>
            {!isPreGame && !isFinished && (
              <SwapCard
                suggestions={suggestions}
                autoSuggestions={rawSuggestions}
                playersById={playersById}
                lineup={lineup}
                injuredIds={injuredIds}
                loanedIds={loanedIds}
                lockedIds={lockedIds}
                pending={isPending}
                subState={subState}
                forceOpen={subDueOpen}
                msUntilDue={msUntilDue}
                subIntervalMs={subIntervalMs}
                pastHooterCarry={pastHooterCarry}
                onOverride={(nextSwaps) => {
                  // Inline override → SAME pin wire as the Plan-Ahead
                  // planner. When the edit matches the engine pick again
                  // (e.g. the coach reverted every chip), drop the pin so
                  // the live suggester takes back over. Otherwise pin the
                  // edited array, preserving any F2 next-period plan on
                  // the shared slice.
                  if (swapsEqual(nextSwaps, rawSuggestions)) {
                    setPlannedRotation(withoutSubPin(pinForThisGame));
                    return;
                  }
                  setPlannedRotation({
                    ...(pinForThisGame ?? {}),
                    gameId,
                    pinnedForPeriod: currentQuarter,
                    pinnedSwaps: nextSwaps,
                  });
                }}
                onApply={() => {
                  for (const s of suggestions) {
                    persistSwap(s.off_player_id, s.on_player_id, s.zone);
                  }
                  if (suggestions.length === 1) {
                    const s = suggestions[0];
                    showSwapToast(
                      `${shortName(s.off_player_id)} → ${shortName(s.on_player_id)}`
                    );
                  } else if (suggestions.length > 1) {
                    showSwapToast(`${suggestions.length} subs made`);
                  }
                  // The pinned plan-ahead sub (if any) has now been
                  // applied — consume it so it can't re-fire next window.
                  // Planned periods stay.
                  setPlannedRotation(withoutSubPin(pinForThisGame));
                  handleSubDueAcknowledge();
                }}
                onApplyOne={(s) => {
                  persistSwap(s.off_player_id, s.on_player_id, s.zone);
                  showSwapToast(
                    `${shortName(s.off_player_id)} → ${shortName(s.on_player_id)}`
                  );
                }}
              />
            )}

            {/* No colour key here (UI polish audit §13): on the live
                screen zone identity is already told three ways in
                place — each tile's zone label sits in the zone colour
                directly above its bar, and the field rails name the
                lines. The key stays on the quarter-break and picker
                screens, where bare bars are the decision aid
                (Steve 2026-06-29). */}
            <Field
              playersById={playersById}
              onTapField={handleTapField}
              swapOffs={swapOffs}
              swapDue={subState === "due"}
              totalMsByPlayer={totalMsByPlayer}
              zoneMsByPlayer={zoneMsByPlayer}
              displayZoneCaps={displayZoneCaps}
              chipModeByKey={chipModeByKey}
              injuredIds={injuredIds}
              lockedIds={lockedIds}
              zoneLockedPlayers={zoneLockedPlayers}
              onLongPress={handleLongPress}
              zoneCaps={zoneCaps}
              positionModel={positionModel}
              wakeUpKey={fieldWakeUpKey}
              playerScores={playerScores}
              totalPairs={totalPairs}
              positionLabels={assignPositionLabels(lineup, aflPlaybook)}
            />
            <Bench
              playersById={playersById}
              onTapBench={handleTapBench}
              swapOns={swapOns}
              totalMsByPlayer={totalMsByPlayer}
              zoneMsByPlayer={zoneMsByPlayer}
              injuredIds={injuredIds}
              loanedIds={loanedIds}
              lockedIds={lockedIds}
              zoneLockedPlayers={zoneLockedPlayers}
              onLongPress={handleLongPress}
              playerScores={playerScores}
              totalPairs={totalPairs}
            />
          </>
        );
      })()}

      {/* Rotation-planning row — sits next to Game Settings (the gear
          icon below), keeping the on-field area uncluttered. The
          upcoming-sub override (F1) now happens INLINE on the SwapCard
          (tap a chip in the suggested-swap section), so the old "Plan
          ahead" button is gone (issue 6); only "Plan Q/H X" (F2) lives
          here now. */}
      {showPlanNextPeriod && (
        <div className="space-y-2">
          {/* Plan-NEXT-period entry (F2 / ROTPLAN-02): offered once the
              rest of this period won't churn the lineup — the final sub
              window, or any time in a no-subs game (canPlanNextPeriod).
              Opens the SAME shared planner on the NEXT period's tab so
              the break opens with a plan in place. A "Next period ready"
              badge + Clear appears once pinned. */}
          {showPlanNextPeriod && (
            <div className="flex items-center justify-between gap-2 px-1">
              <SFButton
                variant="ghost"
                size="md"
                data-testid="plan-next-period-entry"
                onClick={() => setPlanNextOpen(true)}
                icon={<SFIcon.whistle />}
              >
                {hasPinnedNextPeriod
                  ? `Edit Q${currentQuarter + 1} plan`
                  : `Plan Q${currentQuarter + 1}`}
              </SFButton>
              {hasPinnedNextPeriod && (
                <div className="flex items-center gap-2">
                  <span
                    data-testid="planned-next-period-badge"
                    className="font-mono text-[10px] font-bold uppercase tracking-micro text-brand-700"
                  >
                    Next period ready
                  </span>
                  <button
                    type="button"
                    data-testid="plan-next-clear"
                    onClick={() => setPlannedRotation(consumePeriodPin(pinForThisGame, currentQuarter))}
                    className="font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim transition-colors hover:text-ink"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Admin / utility action row — chrome owned by the shared
          LiveAdminUtilityRow (Phase 5b). Candidates filtering stays
          here (sport-specific: AFL filters against ALL_ZONES). The
          shell hides itself when there's nothing to show. */}
      {(() => {
        const lateCandidates = !isFinished
          ? squadPlayers.filter((p) => {
              const inBench = lineup.bench.includes(p.id);
              const inField = ALL_ZONES.some((z) => lineup[z].includes(p.id));
              return !inBench && !inField;
            })
          : [];
        return (
          <LiveAdminUtilityRow
            candidates={lateCandidates}
            onLateArrival={handleLateArrival}
            lateArrivalPending={isPending}
            auth={auth}
            gameId={gameId}
            isAdmin={isAdmin}
            finished={finalised}
            // Steve 2026-05-20: mid-game settings affordance —
            // the sub interval and players on field. The row's
            // standard settings slot; every sport with a sub
            // interval passes one (netball has none).
            settings={
              <LiveGameSettingsButton
                auth={auth}
                gameId={gameId}
                subIntervalSeconds={subIntervalSeconds}
                currentOnFieldSize={currentOnFieldSize}
                minOnFieldSize={minOnFieldSize}
                maxOnFieldSize={maxOnFieldSize}
                playersById={playersById}
              />
            }
          />
        );
      })()}

      {selected && !isPreGame && !isFinished && (() => {
        const pid = selected.playerId;
        const p = playersById.get(pid);
        const name = p
          ? `${p.jersey_number != null ? `#${p.jersey_number} ` : ""}${p.full_name}`
          : "player";
        // Floating record-score card — chrome owned by the shared
        // ScoreRecordingDock (Phase 5c). The dock pins to bottom-
        // viewport, owns the heading row + Cancel chip + the
        // pointer-events isolation that lets background field
        // taps fall through. Action buttons here are AFL-specific
        // (+Goal/+Behind side-by-side, plus the Swap-player
        // affordance when a field player is selected).
        return (
          <ScoreRecordingDock
            heading={
              canScore ? (
                <>
                  Record score for <span className="text-brand-700">{name}</span>
                </>
              ) : (
                <span className="text-brand-700">{name}</span>
              )
            }
            onCancel={() => clearSelection()}
            onPlayerActions={() => {
              clearSelection();
              handleLongPress(pid);
            }}
            actions={
              <>
                {canScore && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleScore("goal")}
                    disabled={isPending}
                    className="flex-1 rounded-sm bg-brand-600 py-3 font-mono text-base font-bold uppercase tracking-micro text-white shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
                  >
                    + Goal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScore("behind")}
                    disabled={isPending}
                    className="flex-1 rounded-sm bg-warn py-3 font-mono text-base font-bold uppercase tracking-micro text-white shadow-card transition-colors duration-fast ease-out-quart hover:opacity-90 disabled:opacity-60"
                  >
                    + Behind
                  </button>
                </div>
                )}
                {selected.kind === "bench" && (
                  <p className="text-xs text-ink-dim">
                    Tap a field player to swap {p ? p.full_name.split(" ")[0] : "them"} on.
                  </p>
                )}
                {/* Swap player — covers both cases:
                      1. Sub off (pick a bench player → field-to-bench)
                      2. Rotate position (pick another field player in
                         a different zone → field-to-field zone swap)
                    Stagehand 2026-05-09 (afl-u8-auskick) initially
                    surfaced this button as "Sub off" only — but Steve
                    flagged the gap: a coach often wants to rotate a
                    forward to back without subbing them off. The
                    picker now lists both bench AND other-zone field
                    players, with the chosen player's location
                    deciding which swap action fires. */}
                {selected?.kind === "field" && (
                  <button
                    type="button"
                    onClick={() =>
                      setSubOffSelected({
                        playerId: selected.playerId,
                        zone: selected.zone,
                      })
                    }
                    disabled={isPending}
                    className={`${canScore ? "mt-2 " : ""}min-h-[44px] w-full rounded-sm border border-hairline bg-surface-alt text-sm font-semibold text-ink transition-colors duration-fast ease-out-quart hover:bg-hairline disabled:opacity-60`}
                  >
                    Swap player
                  </button>
                )}
              </>
            }
          />
        );
      })()}


      {fillZone && (
        <SlotFillSheet
          slotLabel={ZONE_LABELS[fillZone]}
          candidates={lineup.bench
            .filter((id) => !injuredIds.includes(id) && !loanedIds.includes(id))
            .map((id) => playersById.get(id))
            .filter((p): p is Player => !!p)
            .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage="Nobody on the bench can come on."
          onPick={(pid) => {
            const zone = fillZone;
            setFillZone(null);
            // A deliberate pick, off the sub cadence (as a tap-tap sub).
            persistSwap("", pid, zone, false);
            showSwapToast(`${shortName(pid)} on`);
          }}
          onCancel={() => setFillZone(null)}
        />
      )}

      {pendingSwap && (
        <SwapConfirmDialog
          off={pendingSwap.off}
          on={pendingSwap.on}
          zone={pendingSwap.zone}
          playersById={playersById}
          onConfirm={() => {
            // Manual tap-tap swap = off-cadence; don't reset the sub
            // countdown (issue 5 — keep running toward the next planned
            // rotation).
            persistSwap(pendingSwap.off, pendingSwap.on, pendingSwap.zone, false);
            if (pendingSwap.off) {
              showSwapToast(
                `${shortName(pendingSwap.off)} → ${shortName(pendingSwap.on)}`
              );
            } else {
              showSwapToast(`${shortName(pendingSwap.on)} on`);
            }
            setPendingSwap(null);
          }}
          onCancel={() => setPendingSwap(null)}
        />
      )}

      {showQuarterEndModal && (
        <QuarterEndModal
          quarter={currentQuarter}
          periodCount={ageGroup.periodCount}
          loading={isPending}
          onConfirm={handleQuarterEndConfirm}
          teamName={teamName}
          opponentName={opponentName}
          teamScore={teamScoreState}
          opponentScore={opponentScoreState}
          trackScoring={trackScoring}
          // "Goal on the siren?" — Steve's real-game scenario:
          // a goal lands at the moment the hooter sounds, the
          // QuarterEndModal opens before the +G picker has a
          // chance to fire. Steve 2026-05-13: extended to opponent
          // too — own-team chip opens the scorer picker (player
          // attribution); opponent chip records straight away.
          // The picker reads currentQuarter, which is still the
          // just-ended value until handleQuarterEndConfirm fires,
          // so the score attaches to THIS quarter on either side.
          onTeamLateScore={
            trackScoring ? (kind) => setPickScorerKind(kind) : undefined
          }
          onOpponentLateScore={
            trackScoring ? (kind) => handleOpponent(kind) : undefined
          }
        />
      )}

      {/* End-quarter-early confirm. Destructive — credits all
          on-field players the full quarter time and triggers the
          Q-break (or FT review on Q4). Same shape as
          SwapConfirmDialog so the visual language stays consistent. */}
      {clockMenuOpen && (
        <ClockMenu
          periodAbbr={`Q${currentQuarter}`}
          running={running}
          onPause={handlePause}
          onResume={handleResume}
          onEndEarly={
            !isPreGame && !isFinished ? () => setShowManualEndConfirm(true) : undefined
          }
          onClose={() => setClockMenuOpen(false)}
        />
      )}

      {showManualEndConfirm && (
        <ManualEndQuarterConfirm
          quarter={currentQuarter}
          onConfirm={() => {
            setShowManualEndConfirm(false);
            handleEndQuarter({ creditFullQuarter: true });
          }}
          onCancel={() => setShowManualEndConfirm(false)}
        />
      )}

      {/* Steve 2026-05-13: the await-kickoff modal used to live here
          and gate Q1 / Q-break clock start. It was moved INTO
          LineupPicker (for Q1) and QuarterBreak (for Q-break) so
          "Back to lineup" can cleanly cancel without leaving the
          lineup_set / period_break_swap half-committed. After the
          refactor this surface is never the modal host — the
          modal commits both writes atomically before redirecting
          into LiveGame's auto-resume clock path, so by the time
          LiveGame mounts the clock is already running. */}

      {/* F1 (override the upcoming sub) is no longer a modal — it's the
          inline SwapCard override (issue 3 + issue 6). The old
          planAhead GamePlanModal was removed with its button. */}

      {/* Plan-NEXT-period planner (F2). Same shared GamePlanModal, opened
          on the NEXT period's tab (initialPeriodIndex=1 — period[0] mirrors
          the current field, period[1] is the projected next period). On pin
          we store the edited next-period groups/bench in the SAME
          plannedRotation slice (nextPeriod* fields); the upcoming break
          opens pre-seeded from it. */}
      {planNextOpen && (() => {
        const currentGroups: Record<string, string[]> = {};
        for (const z of activeZones) currentGroups[z] = lineup[z];
        const currentBench = lineup.bench;

        // Only players available for the rest of the game — present (in
        // the current lineup) AND healthy (see availablePlayersForPlan).
        // Without this the planner projected the FULL season squad,
        // including injured + away players (Steve 2026-06-15).
        const inGameIds = new Set<string>([
          ...activeZones.flatMap((z) => lineup[z]),
          ...lineup.bench,
        ]);
        const playersForPlan = availablePlayersForPlan(
          squadPlayers,
          inGameIds,
          new Set(injuredIds),
          new Set(loanedIds),
        );

        // Per-player game context for the planner rows (issue: plan the
        // next quarter with the same info as the break) — total minutes
        // played + per-zone breakdown this game, using the labelled
        // age-group zones.
        const planPlayerStats: Record<
          string,
          { totalMs: number; zones: { label: string; ms: number }[] }
        > = {};
        for (const p of playersForPlan) {
          const zm = zoneMsByPlayer[p.id] ?? {};
          planPlayerStats[p.id] = {
            totalMs: totalMsByPlayer[p.id] ?? 0,
            zones: insightZones.map((z) => ({
              label: z.shortLabel,
              ms: zm[z.id as Zone] ?? 0,
            })),
          };
        }

        const initialPlan = projectUpcomingRotation({
          sport: "afl",
          ageGroup,
          players: playersForPlan,
          onFieldSize: currentOnFieldSize,
          seed: 7,
          chipModeByKey,
          aflPlaybook,
          // Issue 8: the plan must reflect THIS game's configured period
          // length + sub cadence, not the age-group defaults. quarterMs
          // is the effective period length; subIntervalMs is the live
          // even-distribution spacing (quarterMs/(N+1)).
          periodMinutes: quarterMs / 60_000,
          subIntervalSeconds: subIntervalMs / 1000,
          fromPeriodIndex: Math.max(0, currentQuarter - 1),
          currentGroups,
          currentBench,
        });

        // "Suggested / Rotate lines / Set manually" shortcuts — the in-game
        // parity for the break's rotation-mode toggle (Steve's match-day ask).
        // Rotate reuses the cap-aware rotateLines off the CURRENT on-field
        // shape (same helper the break uses); manual clears to bench for a
        // from-scratch build; suggested reverts to the fresh projection.
        const rotateCaps = {} as ZoneCaps;
        for (const z of activeZones) rotateCaps[z] = currentGroups[z].length;
        const rotateLastZone: Record<string, Zone> = {};
        for (const z of activeZones)
          for (const pid of currentGroups[z]) rotateLastZone[pid] = z;
        const rotateZoneMins: Record<string, ZoneMinutes> = {};
        for (const p of playersForPlan) {
          const zm = zoneMsByPlayer[p.id] ?? {};
          const mins = emptyZoneMs();
          for (const z of ALL_ZONES) mins[z] = (zm[z as Zone] ?? 0) / 60_000;
          rotateZoneMins[p.id] = mins;
        }
        const planActions = [
          { key: "suggested", label: "Suggested", apply: () => initialPlan },
          {
            key: "rotate",
            label: "Rotate lines",
            apply: (plan: GamePlan, i: number) => {
              const rotated = rotateLines({
                players: playersForPlan.map((p) => p.id),
                caps: rotateCaps,
                zoneMins: rotateZoneMins,
                lastZone: rotateLastZone,
              });
              const groupIds: Record<string, string[]> = {};
              for (const z of activeZones) groupIds[z] = rotated[z];
              return setPeriodGroups(plan, i, groupIds, rotated.bench);
            },
          },
          {
            key: "manual",
            label: "Set manually",
            apply: (plan: GamePlan, i: number) => clearPeriodToBench(plan, i),
          },
        ];

        return (
          <GamePlanModal
            sport="afl"
            ageGroup={ageGroup}
            players={playersForPlan}
            onFieldSize={currentOnFieldSize}
            teamName={teamName}
            opponentName={opponentName}
            chipModeByKey={chipModeByKey}
            aflPlaybook={aflPlaybook}
            // Reopened after a pin: show the pinned Q{n+1}, not a fresh
            // projection ("Suggested" still reverts to the projection).
            initialPlan={withPinnedPeriods(initialPlan, {
              pin: pinForThisGame,
              fromPeriodIndex: currentQuarter,
              availableIds: playersForPlan.map((p) => p.id),
            })}
            initialPeriodIndex={1}
            playerStats={planPlayerStats}
            planActions={planActions}
            pinLabel={`Pin Q${currentQuarter + 1} plan`}
            onPin={(plan) => {
              // The coach edited the NEXT period. Find it by absolute
              // period number (robust to a Reshuffle that rerolls the
              // whole-game projection), then pin its groups + bench.
              const targetPeriodNum = currentQuarter + 1;
              const next =
                plan.periods.find((p) => p.period === targetPeriodNum) ??
                plan.periods[1];
              if (!next) {
                setPlanNextOpen(false);
                return;
              }
              const nextPeriodGroups: Record<string, string[]> = {};
              for (const g of next.groups) nextPeriodGroups[g.groupId] = g.playerIds;
              // Preserve any existing F1 fields on the same game's pin
              // (the two features share one slice).
              const prior =
                plannedRotation && plannedRotation.gameId === gameId
                  ? plannedRotation
                  : null;
              setPlannedRotation({
                ...(prior ?? {}),
                gameId,
                nextPeriodIndex: currentQuarter,
                nextPeriodGroups,
                nextPeriodBench: next.bench,
              });
            }}
            onClose={() => setPlanNextOpen(false)}
          />
        );
      })()}

      {/* WalkthroughModal lives at the top of LiveGame's render
          (walkthroughOverlay variable) so it's accessible from
          both the QB branch and the main branch — see the const
          definitions above the isBetweenQuarters early return. */}
      {walkthroughOverlay}

      {lockModal && (() => {
        const p = playersById.get(lockModal.playerId);
        if (!p) return null;
        const isFieldLocked = lockedIds.includes(lockModal.playerId);
        const isZoneLocked = !!zoneLockedPlayers[lockModal.playerId];
        const currentLock: "field" | "zone" | null = isFieldLocked ? "field" : isZoneLocked ? "zone" : null;
        const isInjured = injuredIds.includes(lockModal.playerId);
        const isLoaned = loanedIds.includes(lockModal.playerId);
        // Season total for this player includes (a) completed games from server,
        // (b) already-closed loan ms this game, (c) the currently-open loan stint.
        const pid = lockModal.playerId;
        const nowMs = currentElapsedMs();
        const liveGameMins =
          ((basePlayedLoanMs[pid] ?? 0) +
            (loanStartMs[pid] !== undefined ? Math.max(0, nowMs - loanStartMs[pid]) : 0)) /
          60000;
        const seasonLoanMins = (seasonLoanMinutes[pid] ?? 0) + liveGameMins;
        // Squad reference — mean across everyone with non-zero loan mins
        // (completed games only, so it stays stable during the current game).
        const squadValues = Object.values(seasonLoanMinutes).filter((v) => v > 0);
        const squadLoanMins =
          squadValues.length > 0
            ? squadValues.reduce((a, b) => a + b, 0) / squadValues.length
            : 0;
        // F3 (Phase 12) long-press summary. Per-period split comes from the
        // replay-derived initialState.playedZoneMsByPeriod (completed stints,
        // same source as the recency guard's lastSubbedOnMs/completedQuarterMs),
        // with the open live stint overlaid onto the in-progress period.
        const periodWord = ageGroup.periodLabel ?? getSportConfig("afl").periodLabel;
        const periodAbbrev = periodWord.charAt(0).toUpperCase();
        const byPeriod = initialState.playedZoneMsByPeriod[pid] ?? {};
        const insightPerPeriod: {
          period: number;
          periodLabel: string;
          zoneMs: Record<string, number>;
        }[] = [];
        for (let q = 1; q <= currentQuarter; q++) {
          const zoneMs: Record<string, number> = { ...(byPeriod[q] ?? {}) };
          if (q === currentQuarter && !quarterEnded) {
            const z = stintZone[pid];
            const start = stintStartMs[pid];
            if (z && start !== undefined) {
              zoneMs[z] = (zoneMs[z] ?? 0) + Math.max(0, displayNowMs - start);
            }
          }
          const total = Object.values(zoneMs).reduce((a, b) => a + b, 0);
          if (total > 0) {
            insightPerPeriod.push({
              period: q,
              periodLabel: `${periodAbbrev}${q}`,
              zoneMs,
            });
          }
        }
        const insight = (
          <PlayerInsightSummary
            input={{
              zones: insightZones,
              inGameZoneMs: zoneMsByPlayer[pid] ?? {},
              perPeriod: insightPerPeriod,
              seasonZoneMs: season[pid] ?? {},
              seasonPeriod: quarterMs / 60000,
              lastSubbedOnMs: initialState.lastSubbedOnMs[pid] ?? null,
              nowAbsMs: initialState.completedQuarterMs + nowMs,
            }}
          />
        );
        return (
          <LockModal
            player={p}
            currentLock={currentLock}
            currentZone={lockModal.zone}
            isInjured={isInjured}
            isLoaned={isLoaned}
            seasonLoanMins={seasonLoanMins}
            squadLoanMins={squadLoanMins}
            insight={insight}
            onLockField={() => {
              setLocked(lockModal.playerId, true);
              saveLock(lockModal.playerId, { kind: "field" });
              setLockModal(null);
            }}
            onLockZone={() => {
              if (lockModal.zone) {
                setZoneLocked(lockModal.playerId, lockModal.zone);
                saveLock(lockModal.playerId, { kind: "zone", zone: lockModal.zone });
              }
              setLockModal(null);
            }}
            onUnlock={() => {
              setLocked(lockModal.playerId, false);
              setZoneLocked(lockModal.playerId, null);
              saveLock(lockModal.playerId, null);
              setLockModal(null);
            }}
            onToggleInjury={() => {
              // When marking an ON-FIELD player injured, prompt for a bench
              // replacement so the zone doesn't go a player short. Fall
              // through to the direct path when (a) un-marking injury,
              // (b) the player is already on the bench (no zone to fill),
              // or (c) the bench has no eligible replacements.
              const goingToInjured = !isInjured;
              const onFieldZone = lockModal.zone;
              const hasEligibleBench = lineup.bench.some(
                (id) => !injuredIds.includes(id) && !loanedIds.includes(id)
              );
              if (goingToInjured && onFieldZone && hasEligibleBench) {
                setInjuryReplacementModal({
                  injuredId: lockModal.playerId,
                  zone: onFieldZone,
                });
                setLockModal(null);
                return;
              }
              handleInjuryToggle(lockModal.playerId, !isInjured);
              setLockModal(null);
            }}
            onToggleLoan={() => {
              handleLoanToggle(lockModal.playerId, !isLoaned);
              setLockModal(null);
            }}
            onSwitch={() => {
              // Enter the existing tap-tap selection so the user's
              // next tap completes the swap. Resolve field-vs-bench
              // from the live lineup (NOT from lockModal.zone, which
              // falls back to lastStintZone — that'd misroute a
              // bench player who played earlier in the game). Field
              // players become a "field" selection; bench players a
              // "bench" selection. handleTapField/handleTapBench
              // already wire this through to applyFieldZoneSwap or
              // setPendingSwap → SwapConfirmDialog.
              const currentZone = ALL_ZONES.find((z) =>
                lineup[z].includes(lockModal.playerId),
              );
              if (currentZone) {
                selectField(lockModal.playerId, currentZone);
              } else {
                selectBench(lockModal.playerId);
              }
              setLockModal(null);
            }}
            onClose={() => setLockModal(null)}
          />
        );
      })()}

      {injuryReplacementModal && (() => {
        const inj = playersById.get(injuryReplacementModal.injuredId);
        if (!inj) return null;
        // Build the candidate list at render time so it stays fresh if a
        // bench player is loaned/recovered while the picker is open.
        const candidates: InjuryReplacementCandidate[] = lineup.bench
          .filter((id) => !injuredIds.includes(id) && !loanedIds.includes(id))
          .map((id) => ({
            player: playersById.get(id),
            totalMs: totalMsByPlayer[id] ?? 0,
          }))
          .filter((c): c is InjuryReplacementCandidate => !!c.player)
          .sort((a, b) => a.totalMs - b.totalMs);
        return (
          <InjuryReplacementModal
            injuredPlayer={inj}
            spotLabel={ZONE_SHORT_LABELS[injuryReplacementModal.zone]}
            candidates={candidates}
            onPickReplacement={(rid) => {
              handleInjuryReplacement(
                injuryReplacementModal.injuredId,
                rid,
                injuryReplacementModal.zone
              );
              setInjuryReplacementModal(null);
            }}
            onSkipReplacement={() => {
              handleInjuryToggle(injuryReplacementModal.injuredId, true);
              setInjuryReplacementModal(null);
            }}
            onCancel={() => setInjuryReplacementModal(null)}
          />
        );
      })()}

      {/* Pick-scorer sheet — opens when the coach taps the own-team
          `+G`/`+B` chip in the scorebug. Lists every on-field
          player followed by the bench (kept eligible because a goal
          can be credited to a player who just rotated off). Sub-
          label = the player's current zone or "Bench" so the coach
          can find the scorer at a glance. Picking fires the same
          recordPlayerScore path as the tap-tile flow.
          Stagehand finding (2026-05-08): a fresh runner expects
          symmetric per-team `+G`/`+B` and didn't discover the
          tap-player path on their own. */}
      {pickScorerKind && (() => {
        // Scorer picker — Fwd → Centre → Back → Bench order so the
        // most-likely scorers (forwards) sit at the top of the list
        // (Steve 2026-05-13). ALL_ZONES is back-to-forward by
        // default; reverse a local copy here without mutating the
        // shared constant.
        const fieldIds = [...ALL_ZONES].reverse().flatMap((z) => lineup[z]);
        const benchIds = lineup.bench;
        // Filter out injured/loaned — they're not on field and
        // shouldn't be credited with a goal in their absence.
        const eligible = [...fieldIds, ...benchIds].filter(
          (id) => !injuredIds.includes(id) && !loanedIds.includes(id),
        );
        const candidates = eligible
          .map((id) => {
            const p = playersById.get(id);
            if (!p) return null;
            const onFieldZone = ALL_ZONES.find((z) => lineup[z].includes(id));
            return {
              id,
              name: p.full_name,
              jerseyNumber: p.jersey_number,
              // The tile's own short label (CEN, not MID).
              subLabel: onFieldZone ? ZONE_SHORT[onFieldZone] : "Bench",
            };
          })
          .filter((c): c is NonNullable<typeof c> => !!c);
        const slotLabel = pickScorerKind === "goal" ? "Goal" : "Behind";
        return (
          <SlotFillSheet
            slotLabel={slotLabel}
            candidates={candidates}
            titleVerb="Who scored the"
            subtitle={`Pick the player who scored the ${slotLabel.toLowerCase()}.`}
            emptyMessage="No eligible players — every available player is sidelined."
            // Backdrop tap is a no-op here — the coach must either pick
            // a player or hit Cancel. Stagehand 2026-05-09 found that
            // tapping a different chip while this picker was open
            // dismissed it silently and lost the goal attribution.
            dismissOnBackdrop={false}
            // No-scorer escape row at the top of the picker.
            //   • BEHIND → "Rushed": deflected through off the
            //     opposition or our own boot; counts, no scorer.
            //   • GOAL → "Didn't see who": the coach saw it sail
            //     through but missed the kicker (scrum in front,
            //     mid-swap). Without this the only out was Cancel —
            //     which silently lost the goal (UX review #5,
            //     Steve 2026-07-08).
            extraOption={
              pickScorerKind === "behind"
                ? {
                    label: "Rushed (no scorer)",
                    subLabel: "Counts as a behind for our team",
                    onSelect: () => {
                      recordRushedBehind();
                      setPickScorerKind(null);
                    },
                  }
                : {
                    label: "Didn't see who (no scorer)",
                    subLabel: "Counts as a goal for our team",
                    onSelect: () => {
                      recordUnattributedGoal();
                      setPickScorerKind(null);
                    },
                  }
            }
            onPick={(playerId) => {
              recordPlayerScore(playerId, pickScorerKind);
              setPickScorerKind(null);
            }}
            onCancel={() => setPickScorerKind(null)}
          />
        );
      })()}

      {/* Swap-player picker — opens when the coach taps "Swap player"
          in the action drawer for a selected field player. Lists
          BOTH bench players AND other-zone field players (excluding
          the selected player, same-zone players, injured/loaned).
          Sub-label tells the coach where each candidate is
          ("Bench" / zone short label like "FWD"/"BCK") so they can
          pick a sub OR a rotation in one place.

          On pick:
            - Bench player    → setPendingSwap → SwapConfirmDialog
                                → field-to-bench substitution
            - Field player    → applyFieldZoneSwap + recordFieldZoneSwap
                                → direct field-to-field zone swap
                                  (no confirm dialog; same path the
                                  tap-two-field-players flow takes) */}
      {subOffSelected && (() => {
        const offPlayer = playersById.get(subOffSelected.playerId);
        const offName = offPlayer?.full_name ?? "Player";
        const offZone = subOffSelected.zone;
        // Bench candidates — eligible (not injured/loaned).
        const benchCandidates = lineup.bench
          .filter((id) => !injuredIds.includes(id) && !loanedIds.includes(id))
          .map((id) => {
            const p = playersById.get(id);
            if (!p) return null;
            return {
              id,
              name: p.full_name,
              jerseyNumber: p.jersey_number,
              subLabel: "Bench",
              kind: "bench" as const,
              zone: null as Zone | null,
            };
          })
          .filter((c): c is NonNullable<typeof c> => !!c);
        // Field candidates — every other-zone field player except the
        // selected one. Same-zone "swap" is meaningless (zones don't
        // preserve internal order), so we filter by zone !== offZone.
        const fieldCandidates = ALL_ZONES.flatMap((z) =>
          z === offZone
            ? []
            : lineup[z]
                .filter(
                  (id) =>
                    id !== subOffSelected.playerId &&
                    !injuredIds.includes(id) &&
                    !loanedIds.includes(id),
                )
                .map((id) => {
                  const p = playersById.get(id);
                  if (!p) return null;
                  return {
                    id,
                    name: p.full_name,
                    jerseyNumber: p.jersey_number,
                    subLabel: z.toUpperCase(),
                    kind: "field" as const,
                    zone: z,
                  };
                }),
        ).filter((c): c is NonNullable<typeof c> => !!c);
        // Bench first (the more common substitution case), then
        // field rotations grouped by zone.
        const candidates = [...benchCandidates, ...fieldCandidates];
        // Map id → kind/zone so the onPick handler knows which
        // action to fire without re-deriving the lists.
        const candidateById = new Map(candidates.map((c) => [c.id, c]));
        return (
          <SlotFillSheet
            slotLabel={`${offName}'s spot`}
            candidates={candidates.map(({ id, name, jerseyNumber, subLabel }) => ({
              id,
              name,
              jerseyNumber,
              subLabel,
            }))}
            titleVerb="Swap"
            subtitle={`Pick a bench player to sub on for ${offName}, or another on-field player to rotate positions.`}
            emptyMessage="No eligible players — every available player is on this zone, sidelined, or injured."
            // Backdrop tap is OK to dismiss this picker — accidental
            // dismiss returns the coach to the prior selected state
            // with no data loss.
            onPick={(picked) => {
              const c = candidateById.get(picked);
              if (!c) {
                setSubOffSelected(null);
                return;
              }
              if (c.kind === "bench") {
                // Field-to-bench: existing SwapConfirmDialog path.
                setPendingSwap({
                  off: subOffSelected.playerId,
                  on: picked,
                  zone: subOffSelected.zone,
                });
              } else if (c.kind === "field" && c.zone) {
                // Field-to-field zone rotation: same path as
                // tap-A-then-tap-B-in-different-zone. Direct
                // store mutation + server event, no confirm.
                const quarter = Math.max(1, currentQuarter);
                const elapsed_ms = currentElapsedMs();
                applyFieldZoneSwap(
                  subOffSelected.playerId,
                  subOffSelected.zone,
                  picked,
                  c.zone,
                );
                showSwapToast(
                  `${shortName(subOffSelected.playerId)} ⇄ ${shortName(picked)} — zones swapped`,
                );
                enqueueLiveAction("recordFieldZoneSwap", [
                  auth,
                  gameId,
                  {
                    player_a_id: subOffSelected.playerId,
                    zone_a: subOffSelected.zone,
                    player_b_id: picked,
                    zone_b: c.zone!,
                    quarter,
                    elapsed_ms,
                  },
                ]);
              }
              clearSelection();
              setSubOffSelected(null);
            }}
            onCancel={() => setSubOffSelected(null)}
            dismissOnBackdrop
          />
        );
      })()}

      {/* Full-time game summary — renders only AFTER the coach has
          tapped "Finalise game" in the FullTimeReview panel above.
          Until then `finalised` is false and the review takes the
          place of the summary. */}
      {finalised && (
        <GameSummaryCard
          teamName={teamName}
          opponentName={opponentName}
          trackScoring={trackScoring}
          playersById={playersById}
          // Finishing refreshes the route, so the replay has every swap.
          subCount={initialState.subCount}
          presentIds={[
            ...(["back", "hback", "mid", "hfwd", "fwd"] as Zone[]).flatMap((z) => lineup[z]),
            ...lineup.bench,
            ...injuredIds,
            ...loanedIds,
          ]}
        />
      )}


      {/* Sticky-bottom scorebug — only during live play (Steve
          2026-05-13 wants the +G / +B chips thumb-reachable AND
          the bar to look properly locked to the bottom, not a
          floating card). Full-width, edge-to-edge solid surface
          with a top border + upward shadow so scrolling content
          disappears cleanly behind it. The GameHeader inside
          gets `flat` so its inner card chrome is stripped — no
          card-on-card. Safe-area-aware bottom padding clears the
          iPhone home indicator. z-30 sits below the SlotFillSheet
          (z-50) so the player-attribution picker still overlays
          cleanly on +G / +B taps. */}
      {/* Sticky-bottom "Finish game" CTA — locks to viewport bottom
          on the finalised summary screen so the coach has a big,
          unmissable exit after the game's done. Renders ONLY when
          `finalised` (FullTimeReview reconcile step needs full
          attention on the score grid).

          Team-auth coach → /dashboard (last-team cookie bounces
          single-team users to their team home).

          Token-auth parent-runner has no /dashboard (they aren't
          signed in). Sending them there hits the login wall and
          they panic ("did the game save?"). Steve 2026-05-13
          usability test (Lisa B3): show a small "All done — you
          can close this tab" message instead. The implicit
          close-tab gesture is universal across platforms; we
          don't need to send them anywhere. */}
      {finalised && auth.kind === "team" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:pt-4">
          <div className="mx-auto max-w-4xl">
            <SFButton href="/dashboard" variant="accent" size="lg" full>
              Done
            </SFButton>
          </div>
        </div>
      )}
      {finalised && auth.kind === "token" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:pt-4">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-semibold text-ink">
              All done — thanks for running today&apos;s game!
            </p>
            <p className="mt-0.5 text-xs text-ink-dim">
              Everything&apos;s saved. You can close this tab.
            </p>
          </div>
        </div>
      )}

      {/* Sticky-bottom scorebug + undo strip — chrome owned by
          the shared LiveStickyScoreBar (Phase 5d). Wrapper does
          the bottom-pin, safe-area padding, slide-in-bottom-fast
          entrance (P1-14), and the mx-auto max-w-4xl inner
          constraint. The scorebug + the undo strip (gated on
          lastScore + !isPreGame + !isFinished here) are passed in. */}
      {isLivePlay && (
        <LiveStickyScoreBar
          scorebug={gameHeader}
          scoringOff={
            !trackScoring
              ? { settingsHref: auth.kind === "team" && isAdmin ? `/teams/${auth.teamId}/settings#section-game-day-extras` : null }
              : undefined
          }
          undoStrip={
            lastScore && !isPreGame && !isFinished ? (
              <UndoStrip
                flashing={undoToastVisible}
                message={`${lastScore.forTeam === "us" ? teamName : opponentName} ${lastScore.kind}${lastScore.playerName ? ` — ${lastScore.playerName}` : ""}`}
                onUndo={handleUndo}
                disabled={isPending}
              />
            ) : null
          }
        />
      )}

      {/* First-time onboarding hint for the long-press affordance.
          Self-dismisses on first long-press / Got-it tap / 12s. The
          hint reads localStorage on mount and never re-shows after
          dismissal. P1.5-3 in MICRO-INTERACTIONS-PLAN.md. Gated on
          isLivePlay so it doesn't appear during pre-game (no
          long-press flow there) or post-game (the gesture is moot). */}
      {/* Hidden while the player dock is open so it never covers it. */}
      <LongPressHint enabled={isLivePlay && !selected} />
    </div>
  );
}
