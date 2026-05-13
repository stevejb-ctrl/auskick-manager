"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  clockElapsedMs,
  useLiveGame,
} from "@/lib/stores/liveGameStore";
import {
  undoLastScore,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/live/Field";
import { Bench } from "@/components/live/Bench";
import { GameHeader } from "@/components/live/GameHeader";
import { QuarterScoreModal } from "@/components/live/QuarterScoreModal";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { SwapCard } from "@/components/live/SwapCard";
import { SwapConfirmDialog } from "@/components/live/SwapConfirmDialog";
import { QuarterBreak } from "@/components/live/QuarterBreak";
import { WalkthroughModal, buildWalkthroughSteps } from "@/components/live/WalkthroughModal";
import { LateArrivalMenu } from "@/components/live/LateArrivalMenu";
import { QuarterEndModal } from "@/components/live/QuarterEndModal";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import { SubDueModal } from "@/components/live/SubDueModal";
import { LockModal } from "@/components/live/LockModal";
import {
  InjuryReplacementModal,
  type InjuryReplacementCandidate,
} from "@/components/live/InjuryReplacementModal";
import { GameSummaryCard } from "@/components/live/GameSummaryCard";
import { FullTimeReview } from "@/components/live/FullTimeReview";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import {
  ALL_ZONES,
  emptyZoneMs,
  suggestSwaps,
  type GameState,
  type PlayerZoneMinutes,
  type SeasonAvailability,
  type ZoneCaps,
  type ZoneMinutes,
} from "@/lib/fairness";
import type { Game, Player, PositionModel, Zone } from "@/lib/types";
import { positionsFor } from "@/lib/ageGroups";
import { isYouTubeUrl, youtubeVideoId } from "@/lib/songUrl";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";

// Minimal inline types for the YouTube IFrame API — no @types/youtube needed.
interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}
declare global {
  interface Window {
    YT: { Player: new (el: string | HTMLElement, opts: object) => YTPlayer };
    onYouTubeIframeAPIReady: () => void;
  }
}

// Module-level singleton AudioContext for the sub-due beep. Modern
// browsers (mobile Safari especially) create AudioContexts in
// "suspended" state and silently no-op until a user gesture
// resume()s them. The previous implementation created a FRESH
// context inside playBeep() on each call — and because playBeep()
// runs from a useEffect (sub-state transition), there's no user
// gesture in the call stack and the context stays suspended.
// Steve reported 2026-05-09: the sub-due sound used to play but
// no longer does.
//
// Fix: keep a single context across the page lifetime, and unlock
// it on the first user pointerdown anywhere on the page (see the
// useEffect inside LiveGame). After that the context's `state`
// flips to "running" and subsequent oscillator plays are audible.
let _audioCtx: AudioContext | null = null;
function getOrCreateAudioCtx(): AudioContext | null {
  if (_audioCtx) return _audioCtx;
  if (typeof window === "undefined") return null;
  const Ctx =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  _audioCtx = new Ctx();
  return _audioCtx;
}

function playBeep() {
  const ctx = getOrCreateAudioCtx();
  if (!ctx) return;
  try {
    // Re-attempt resume in case the context drifted back to
    // suspended (some browsers do this on tab-blur / inactivity).
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.45);
  } catch {
    // ignore — some browsers block before user interaction
  }
}

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
  /** Per-chip mode (split/group) — passed to QuarterBreak's suggester. */
  chipModeByKey?: Partial<Record<"a" | "b" | "c", "split" | "group">>;
  exitHref?: string;
  /** Public URL of the team song audio file, if configured. */
  songUrl?: string | null;
  /** Seconds into the song to start playback from (default 0). */
  songStartSeconds?: number;
  /** How many seconds to play the song for after each goal (default 15). */
  songDurationSeconds?: number;
  /** Speed multiplier for demo games — scales stored elapsed_ms and sub/quarter timing (default 1). */
  clockMultiplier?: number;
  /** Effective quarter duration in milliseconds for this game/team/age-group.
   * Computed by parent via getEffectiveQuarterSeconds(team, ageGroup, game) * 1000.
   * D-26 / D-27: replaces hardcoded QUARTER_MS at the countdown cap and hooter trigger. */
  quarterMs: number;
  /**
   * Suppress the first-visit walkthrough auto-open. Used by the
   * runner-token page when it ALSO renders an availability section
   * above LiveGame — without this, the welcome modal opens at
   * z-50 fixed inset-0 and silently swallows clicks meant for the
   * availability buttons underneath. Coaches still see the
   * walkthrough on the team-auth live page (default behaviour).
   * The "?" button always remains as a manual trigger.
   */
  suppressAutoWalkthrough?: boolean;
}

type LastScore = {
  kind: "goal" | "behind";
  forTeam: "us" | "opponent";
  playerId: string | null;
  playerName: string | null;
  quarter: number;
};

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
  exitHref,
  songUrl,
  songStartSeconds = 0,
  songDurationSeconds = 15,
  clockMultiplier = 1,
  quarterMs,
  suppressAutoWalkthrough = false,
}: LiveGameProps) {
  const activeZones = useMemo(() => positionsFor(positionModel), [positionModel]);
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
  const loanStartMs = useLiveGame((s) => s.loanStartMs);
  const basePlayedLoanMs = useLiveGame((s) => s.basePlayedLoanMs);
  const setLoaned = useLiveGame((s) => s.setLoaned);
  const lockedIds = useLiveGame((s) => s.lockedIds);
  const setLocked = useLiveGame((s) => s.setLocked);
  const zoneLockedPlayers = useLiveGame((s) => s.zoneLockedPlayers);
  const setZoneLocked = useLiveGame((s) => s.setZoneLocked);
  const lastStintZone = useLiveGame((s) => s.lastStintZone);

  const activeGameId = useLiveGame((s) => s.activeGameId);

  const walkthroughSteps = useMemo(() => buildWalkthroughSteps(trackScoring), [trackScoring]);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [walkthroughSkipWelcome, setWalkthroughSkipWelcome] = useState(false);

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
  const [pendingSwap, setPendingSwap] = useState<{ off: string; on: string; zone: Zone } | null>(null);
  const [, setTick] = useState(0);
  const prevSubStateRef = useRef<"idle" | "soft" | "due">("idle");
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [showQuarterEndModal, setShowQuarterEndModal] = useState(false);
  const quarterEndTriggeredRef = useRef<number | null>(null);
  // Bumped from the hooter trigger below so GameHeader's clock pill
  // halos with the brand siren pulse exactly when the quarter ends.
  // Initial null suppresses the pulse on first render (a fresh page
  // load shouldn't auto-pulse — only sirenic moments should).
  // Mirrors NetballLiveGame's clockPulseKey state.
  const [clockPulseKey, setClockPulseKey] = useState<number | null>(null);
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

  // Team song — play songDurationSeconds from the configured start point on each goal
  const songAudioRef = useRef<HTMLAudioElement | null>(null);
  const songTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const ytReadyRef = useRef(false);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hydrated || !songUrl || !isYouTubeUrl(songUrl)) return;
    const videoId = youtubeVideoId(songUrl);
    if (!videoId || !ytContainerRef.current) return;

    const playerDiv = document.createElement("div");
    ytContainerRef.current.appendChild(playerDiv);

    function createPlayer() {
      ytPlayerRef.current = new window.YT.Player(playerDiv, {
        // Force a 1×1 iframe — the YT API defaults to 640×360, which
        // otherwise bleeds past the viewport and inflates page scroll
        // area by ~125 px wide × 192 px tall.
        width: "1",
        height: "1",
        videoId,
        playerVars: { autoplay: 0, controls: 0, fs: 0, rel: 0, playsinline: 1 },
        events: {
          onReady: () => { ytReadyRef.current = true; },
        },
      });
    }

    if (window.YT?.Player) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }

    return () => {
      ytPlayerRef.current?.destroy();
      ytPlayerRef.current = null;
      ytReadyRef.current = false;
      playerDiv.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songUrl, gameId, hydrated]);

  function playSong() {
    if (!songUrl) return;
    try {
      if (songTimerRef.current !== null) {
        clearTimeout(songTimerRef.current);
        songTimerRef.current = null;
      }
      if (isYouTubeUrl(songUrl)) {
        if (!ytReadyRef.current || !ytPlayerRef.current) return;
        ytPlayerRef.current.seekTo(songStartSeconds, true);
        ytPlayerRef.current.playVideo();
        songTimerRef.current = setTimeout(() => {
          ytPlayerRef.current?.pauseVideo();
          songTimerRef.current = null;
        }, songDurationSeconds * 1000);
      } else {
        const audio = songAudioRef.current ?? new Audio(songUrl);
        songAudioRef.current = audio;
        audio.currentTime = songStartSeconds;
        audio.play().catch(() => {});
        songTimerRef.current = setTimeout(() => {
          audio.pause();
          songTimerRef.current = null;
        }, songDurationSeconds * 1000);
      }
    } catch {
      // ignore any audio API errors
    }
  }

  const playersById = useMemo(
    () => new Map(squadPlayers.map((p) => [p.id, p])),
    [squadPlayers]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("gm-walkthrough-seen")) return;
    // Caller can suppress auto-open on first visit — used by the
    // runner-token page when it's also rendering an availability
    // section above this component, since the modal would block
    // the availability buttons underneath. The "?" button still
    // surfaces it manually. Default behaviour (auto-open on first
    // visit) is unchanged when the prop isn't passed.
    if (suppressAutoWalkthrough) return;
    setWalkthroughOpen(true);
  }, [suppressAutoWalkthrough]);

  function handleWalkthroughClose() {
    localStorage.setItem("gm-walkthrough-seen", "1");
    setWalkthroughOpen(false);
    setWalkthroughSkipWelcome(false);
  }

  function handleOpenWalkthrough() {
    setWalkthroughSkipWelcome(true);
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
    if (
      activeGameId === gameId &&
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
      accumulatedMs = Math.max(
        0,
        Date.now() - new Date(initialState.quarterStartedAt).getTime(),
      );
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
      clockStartedAt,
      accumulatedMs,
    });
    setHydrated(true);
  }, [init, initialState, gameId, activeGameId]);

  function currentElapsedMs() {
    return clockElapsedMs({ clockStartedAt, accumulatedMs });
  }

  function scaledElapsedMs() {
    return currentElapsedMs() * clockMultiplier;
  }

  useEffect(() => {
    if (clockStartedAt === null) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [clockStartedAt]);

  useEffect(() => {
    if (currentQuarter >= 1 && !quarterEnded && !finalised) {
      setSubBaseMs(clockElapsedMs({ clockStartedAt, accumulatedMs }));
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
      }
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
      const elapsed_ms = scaledElapsedMs();
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
    // Light haptic tap on mobile.
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) {
      navigator.vibrate?.(40);
    }
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
    const elapsed_ms = scaledElapsedMs();
    const p = playersById.get(playerId);
    incTeam(kind === "goal" ? "goals" : "behinds");
    incPlayerScore(playerId, kind === "goal" ? "goals" : "behinds");
    if (kind === "goal") playSong();
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

  // Rushed behind: ball deflects through off the opposition (or
  // self-rushed). Counts +1 for our team but has no scorer, so it
  // skips the per-player tally and never plays the goal song.
  // Only called for `behind` — goals always have a scorer.
  function recordRushedBehind() {
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = scaledElapsedMs();
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
    const elapsed_ms = scaledElapsedMs();
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
    const elapsed_ms = scaledElapsedMs();
    setSubBaseMs(currentElapsedMs());
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
    const elapsed_ms = scaledElapsedMs();
    setLoaned(playerId, loaned);
    enqueueLiveAction("markLoan", [
      auth,
      gameId,
      { player_id: playerId, loaned, quarter, elapsed_ms },
    ]);
  }

  function handleLateArrival(playerId: string) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = scaledElapsedMs();
    addBenchPlayer(playerId);
    enqueueLiveAction("addLateArrival", [
      auth,
      gameId,
      { player_id: playerId, quarter, elapsed_ms },
    ]);
  }

  function handleOpponent(kind: "goal" | "behind") {
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = scaledElapsedMs();
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

    startTransition(async () => {
      const result = await undoLastScore(auth, gameId, {
        kind: serverKind,
        quarter,
        playerId: playerId ?? null,
      });
      if (!result.success) setError(result.error);
    });
  }

  function persistSwap(off: string, on: string, zone: Zone) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = scaledElapsedMs();
    setSubBaseMs(currentElapsedMs()); // raw — sub timer compares against raw nowMs
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

  function handleStartFirstQuarter() {
    setError(null);
    const { flushed } = enqueueLiveAction("startQuarter", [auth, gameId, 1]);
    beginNextQuarter();
    // Q1 is gated on the StartQuarterModal — the modal is the only
    // kickoff affordance in pre-game (we removed the duplicate
    // "Start Q1" button that used to sit on the main UI). The
    // single tap on the modal both writes the server quarter_start
    // event AND starts the local clock so the GM doesn't have to
    // confirm twice.
    startClock();
    // Wait for the queue to flush before refreshing — otherwise we
    // refetch SSR state that doesn't yet include the quarter_start
    // event, the init effect sees storeAheadOfServer=true and wipes
    // the optimistic local state. Online: flush is sub-second; the
    // refresh chains in immediately. Offline: refresh fires when
    // the network comes back and the queue drains.
    flushed.then(() => router.refresh());
  }

  function handlePause() {
    pauseClock();
  }

  function handleResume() {
    startClock();
  }

  function handleEndQuarter(opts?: { creditFullQuarter?: boolean }) {
    setError(null);
    const q = currentQuarter;
    // Auto-hooter path uses the actual scaled clock elapsed.
    // Manual "End quarter early" path (Steve's real-game scenario:
    // clock paused at the start of the quarter, forgot to resume,
    // game continued anyway) credits on-field players the full
    // quarter — what they actually played, not what the clock saw.
    const elapsed_ms = opts?.creditFullQuarter ? quarterMs : scaledElapsedMs();
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
    flushed.then(() => router.refresh());
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
  // Full time has TWO phases: REVIEW (Q4 ended, not yet finalised)
  // and FINISHED (game_finalised event fired). Review shows a
  // FullTimeReview panel where the coach can fix scores; tapping
  // "Finalise game" writes game_finalised → flips us to FINISHED →
  // GameSummaryCard takes over. `isFinished` covers BOTH phases for
  // UI-suppression purposes (no more SwapCard / scoring buttons /
  // start-quarter modal once Q4 is over). The summary itself
  // renders only when `finalised` is true.
  const isAtFullTime = !finalised && currentQuarter >= 4 && quarterEnded;
  const isFinished = finalised || isAtFullTime;
  const isBetweenQuarters = quarterEnded && currentQuarter >= 1 && currentQuarter < 4;

  // Kickoff modal state. The modal opens by DEFAULT whenever the
  // game is awaiting kickoff (pre-Q1, or post-QuarterBreak before
  // the clock-start CTA fires) — that's the prominent "Ready for
  // Q{n}" affordance the GM expects. If they tap "Back to lineup"
  // the modal closes and a page-level "Start Q{n}" button surfaces
  // so they can re-trigger when ready. The page button is
  // INTENTIONALLY hidden while the modal is up — only one kickoff
  // affordance visible at a time. Reset on every quarter transition
  // so each new quarter's modal auto-shows.
  const [startModalDismissed, setStartModalDismissed] = useState(false);
  // Per-quarter explicit kickoff acknowledgement. Tracks which
  // quarter has had its "Start Q{n}" button tapped IN THIS SESSION.
  // Earlier the modal-visibility logic inferred kickoff from
  // (running && accumulatedMs === 0) — but with init() preserving
  // accumulatedMs across reloads (so the displayed clock is right
  // after a refresh), that gate let the modal silently auto-close
  // a couple of seconds after the QuarterBreak commit. Steve
  // 2026-05-10: "Rather than having to click 'Start Qx' to start
  // the quarter, it shows the modal for a couple of seconds and
  // then automatically starts it. I dont want this." Now the
  // modal stays put until the coach explicitly taps Start (or
  // Back to lineup). Page reload mid-quarter is handled by
  // re-showing the modal — slight UX cost, but no more
  // auto-progression.
  const [kickoffAckQuarter, setKickoffAckQuarter] = useState<number | null>(
    null,
  );
  useEffect(() => {
    setStartModalDismissed(false);
    // Preserve the ack if it points at the quarter we just entered.
    // handleStartFirstQuarter / handleStartNextQuarter set the ack
    // to the about-to-be-current quarter BEFORE calling
    // beginNextQuarter, which then changes currentQuarter and
    // triggers this effect. Without the prev-matches check, the
    // ack would be reset to null right after being set, and the
    // modal would re-render. (Saw this as a ~50ms flicker that
    // failed the Q1 "modal hidden after Start tap" e2e spec.)
    setKickoffAckQuarter((prev) => (prev === currentQuarter ? prev : null));
  }, [currentQuarter]);

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

  // Unlock the singleton AudioContext on the first user pointer-
  // down anywhere on the page. Modern browsers start AudioContexts
  // in "suspended" state and only honour resume() when called
  // from inside a user-gesture handler. Without this the
  // sub-due beep silently no-ops (Steve's bug report 2026-05-09).
  // Subscribed once per LiveGame mount; cleaned up on unmount so
  // a stale listener doesn't survive navigation.
  useEffect(() => {
    if (typeof document === "undefined") return;
    function unlock() {
      const ctx = getOrCreateAudioCtx();
      if (ctx && ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }
    }
    document.addEventListener("pointerdown", unlock, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
    };
  }, []);

  const nowMs = clockElapsedMs({ clockStartedAt, accumulatedMs });
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

  const subIntervalMs = subIntervalSeconds * 1000;
  // Divide sub interval by multiplier so subs fire at the right virtual-game cadence.
  const effectiveSubIntervalMs = subIntervalMs / clockMultiplier;
  const msUntilDue =
    subBaseMs !== null && !isPreGame && !isFinished
      ? subBaseMs + effectiveSubIntervalMs - nowMs
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
    // Picker-race guard: don't open the SubDueModal on top of an
    // active score-attribution picker. The coach is mid-pick;
    // dropping the sub modal over them would either dismiss the
    // picker or steal focus, in either case losing the goal
    // attribution. The sub-due state stays "due" while the picker
    // is open — once the coach resolves attribution and the
    // picker closes, the modal opens automatically (subState
    // didn't change, prevSubStateRef is still "due", but we
    // re-check on every render via this effect's deps).
    if (pickScorerKind !== null) return;
    if (subState === "due" && prevSubStateRef.current !== "due") {
      playBeep();
      setSubModalOpen(true);
      if (window.matchMedia("(hover: none)").matches) {
        navigator.vibrate?.([200, 100, 200]);
      }
    }
    if (subState !== "due") {
      setSubModalOpen(false);
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
      if (songTimerRef.current !== null) {
        clearTimeout(songTimerRef.current);
        songTimerRef.current = null;
      }
      songAudioRef.current?.pause();
      ytPlayerRef.current?.pauseVideo();
    };
  }, []);

  function handleSubModalAcknowledge() {
    setSubModalOpen(false);
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
      const elapsed = clockElapsedMs({ clockStartedAt, accumulatedMs });
      if (elapsed * clockMultiplier >= quarterMs && quarterEndTriggeredRef.current !== currentQuarter) {
        quarterEndTriggeredRef.current = currentQuarter;
        // Freeze the clock at the hooter so per-player stint times don't keep
        // accruing while the GM reads the modal.
        pauseClock();
        setShowQuarterEndModal(true);
        // Brand pulse on the GameHeader clock pill — re-keys per
        // quarter so each hooter event fires exactly one halo.
        setClockPulseKey(currentQuarter);
        if (window.matchMedia("(hover: none)").matches) {
          navigator.vibrate?.([200, 100, 200]);
        }
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

  if (isBetweenQuarters) {
    return (
      <QuarterBreak
        auth={auth}
        gameId={gameId}
        players={squadPlayers}
        season={season}
        seasonAvailability={seasonAvailability}
        zoneCaps={zoneCaps}
        positionModel={positionModel}
        currentOnFieldSize={currentOnFieldSize}
        minOnFieldSize={minOnFieldSize}
        maxOnFieldSize={maxOnFieldSize}
        defaultOnFieldSize={defaultOnFieldSize}
        chipModeByKey={chipModeByKey}
        onStarted={() => beginNextQuarter()}
      />
    );
  }

  function handleLongPress(playerId: string) {
    const zone = stintZone[playerId] ?? lastStintZone[playerId] ?? null;
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
          zoneLockedPlayers
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
  const suggestions = subPastHooter ? [] : rawSuggestions;

  const canScore = trackScoring && !isPreGame && !isFinished && selected?.kind === "field";

  function handleClockTap() {
    if (isPreGame || isFinished) return;
    if (running) handlePause();
    else handleResume();
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
      // End-Q-early "rescue" path. The header only renders the
      // chip when paused, but we still gate by !isPreGame here
      // so a coach who pauses pre-Q1 (e.g. waiting on stragglers)
      // can't accidentally end Q0.
      onEndQuarterEarly={
        !isPreGame && !isFinished
          ? () => setShowManualEndConfirm(true)
          : undefined
      }
      // Strip the inner card chrome when sticky-bottom (Steve
      // 2026-05-13): the wrapper carries its own bar styling and
      // a card-on-card look reads as bumpy.
      flat={isLivePlay}
    />
  );

  return (
    <div className="space-y-3">
      {/* In-game top bar — sticky-top, full-width, mirrors the (app)
          layout header's visual treatment (the (app) header is
          hidden on /live routes by AppHeaderShell so this is the
          sole top chrome). Steve 2026-05-13: pulls Exit + game date
          + walkthrough ? out of their previous spots (separate
          GameInfoHeader strip + a thin utility row) so they share a
          single bar.

          Negative inset-x compensates for the parent <main> px-4 so
          the bar can run edge-to-edge and the backdrop-blur reads
          the same way the (app) header did. */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 border-b border-hairline bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-surface/70">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2 sm:py-3">
          {exitHref ? (
            <Link
              href={exitHref}
              className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute transition-colors hover:text-ink-dim"
            >
              ✕ Exit
            </Link>
          ) : (
            <span />
          )}
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-center gap-x-2 text-xs text-ink-mute">
            {game.round_number != null && (
              <span className="font-mono font-bold uppercase tracking-micro text-ink-dim">
                R{game.round_number}
              </span>
            )}
            <span className="truncate">
              <FormattedDateTime iso={game.scheduled_at} mode="long" />
            </span>
            {game.location && (
              <span className="truncate">· {game.location}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleOpenWalkthrough}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-hairline font-mono text-[11px] font-bold text-ink-mute transition-colors duration-fast ease-out-quart hover:border-ink-dim hover:text-ink-dim"
            aria-label="Open walkthrough"
          >
            ?
          </button>
        </div>
      </div>

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

      {/* Swap-done toast — flashes briefly after a substitution lands.
          Wrapped in SirenPulseHalo so the brand pulse halos the toast
          on appearance. The toast is conditionally rendered (mounts +
          unmounts each swap), so a constant triggerKey is enough — the
          halo's inner span re-mounts with the wrapper and the
          animation restarts each time. */}
      {swapToast && !isPreGame && !isFinished && (
        <SirenPulseHalo triggerKey="swap" size="sm" display="block" className="rounded-sm">
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-sm border border-brand-200 bg-brand-50 px-3 py-1.5 text-brand-800 shadow-card"
          >
            <span
              aria-hidden
              className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold leading-none text-warm"
            >
              ✓
            </span>
            <span className="text-xs font-semibold">{swapToast}</span>
          </div>
        </SirenPulseHalo>
      )}

      {/* Undo strip is rendered inside the sticky-bottom bar
          during live play (Steve 2026-05-13). The lastScore +
          isPreGame/isFinished gates apply down there too — when
          conditions fail the strip just doesn't render and the
          sticky bar is shorter. */}

      {/* Page-level "Start Q{n}" trigger — appears ONLY when the
          GM has dismissed the await-kickoff modal via "Back to
          lineup", giving them a way to re-open it when they're
          ready. Hidden while the modal is up so there's only one
          kickoff affordance visible at a time. */}
      {!isFinished &&
        !quarterEnded &&
        !running &&
        accumulatedMs === 0 &&
        startModalDismissed && (
          <Button
            className="w-full"
            onClick={() => setStartModalDismissed(false)}
            loading={isPending}
          >
            Start Q{isPreGame ? 1 : currentQuarter}
          </Button>
        )}

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

      {(() => {
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
                playersById={playersById}
                pending={isPending}
                subState={subState}
                forceOpen={subModalOpen}
                msUntilDue={msUntilDue}
                subIntervalMs={subIntervalMs}
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
                  handleSubModalAcknowledge();
                }}
                onApplyOne={(s) => {
                  persistSwap(s.off_player_id, s.on_player_id, s.zone);
                  showSwapToast(
                    `${shortName(s.off_player_id)} → ${shortName(s.on_player_id)}`
                  );
                }}
              />
            )}

            <Field
              playersById={playersById}
              onTapField={handleTapField}
              swapOffs={swapOffs}
              totalMsByPlayer={totalMsByPlayer}
              zoneMsByPlayer={zoneMsByPlayer}
              injuredIds={injuredIds}
              lockedIds={lockedIds}
              zoneLockedPlayers={zoneLockedPlayers}
              onLongPress={handleLongPress}
              zoneCaps={zoneCaps}
              positionModel={positionModel}
              playerScores={playerScores}
              totalPairs={totalPairs}
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
            {!isFinished && (
              <LateArrivalMenu
                candidates={squadPlayers.filter((p) => {
                  const inBench = lineup.bench.includes(p.id);
                  const inField = ALL_ZONES.some((z) => lineup[z].includes(p.id));
                  return !inBench && !inField;
                })}
                onAdd={handleLateArrival}
                pending={isPending}
              />
            )}
          </>
        );
      })()}

      {canScore && (() => {
        const pid = selected && selected.kind === "field" ? selected.playerId : null;
        const p = pid ? playersById.get(pid) : null;
        // Full-width fixed wrapper pins to the visual viewport regardless of
        // any ancestor with transform/filter; the inner card is
        // width-constrained and centered so it can't overflow horizontally.
        return (
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-2 pt-2"
            style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
          >
            <div className="pointer-events-auto mx-auto max-w-xl rounded-md border-2 border-brand-500 bg-surface p-3 shadow-modal">
              <div className="mb-2 flex items-center gap-2">
                <p className="flex-1 truncate text-sm font-semibold text-ink">
                  Record score for{" "}
                  <span className="text-brand-700">
                    {p ? `#${p.jersey_number} ${p.full_name}` : "player"}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => clearSelection()}
                  className="flex-shrink-0 font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute hover:text-ink-dim"
                >
                  Cancel
                </button>
              </div>
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
                  className="mt-2 w-full rounded-sm border border-hairline bg-surface-alt py-2 text-xs font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-hairline hover:text-ink disabled:opacity-60"
                >
                  Swap player
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {selected && !canScore && (
        <p className="rounded-sm bg-brand-50 px-3 py-2 text-xs text-brand-800">
          {selected.kind === "field"
            ? "Tap a bench player to swap them in, or tap the selected player again to cancel."
            : "Tap a field tile to swap this player in, or tap them again to cancel."}
        </p>
      )}

      {pendingSwap && (
        <SwapConfirmDialog
          off={pendingSwap.off}
          on={pendingSwap.on}
          zone={pendingSwap.zone}
          playersById={playersById}
          onConfirm={() => {
            persistSwap(pendingSwap.off, pendingSwap.on, pendingSwap.zone);
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
          loading={isPending}
          onConfirm={handleQuarterEndConfirm}
          // "Goal on the siren?" — Steve's real-game scenario:
          // a goal lands at the moment the hooter sounds, the
          // QuarterEndModal opens before the +G picker has a
          // chance to fire. Surfacing the picker here keeps the
          // attribution attached to THIS quarter (the picker
          // reads currentQuarter, which is still the just-ended
          // value until handleQuarterEndConfirm fires). The +B
          // path covers a rushed behind on the siren too.
          onLateScore={
            trackScoring ? (kind) => setPickScorerKind(kind) : undefined
          }
        />
      )}

      {/* End-quarter-early confirm. Destructive — credits all
          on-field players the full quarter time and triggers the
          Q-break (or FT review on Q4). Same shape as
          SwapConfirmDialog so the visual language stays consistent. */}
      {showManualEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setShowManualEndConfirm(false)}
          />
          <div className="relative w-full max-w-sm rounded-lg border border-hairline bg-surface p-5 shadow-modal">
            <p className="text-center text-sm font-semibold text-ink">
              End Q{currentQuarter} now?
            </p>
            <p className="mt-2 text-center text-xs text-ink-mute">
              On-field players will be credited the full quarter time, even
              though the clock is paused. Use this when the game played on
              but the clock didn&rsquo;t.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                className="flex-1"
                variant="danger"
                onClick={() => {
                  setShowManualEndConfirm(false);
                  handleEndQuarter({ creditFullQuarter: true });
                }}
              >
                End Q{currentQuarter}
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => setShowManualEndConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Await-kickoff modal — the ONLY kickoff affordance for every
          quarter. In pre-game (cQ=0, lineup committed via startGame)
          the modal opens on page load so the GM has a single CTA to
          tap when the hooter goes — not a duplicate "Start Q1" button
          on the page that just opens the modal. For Q2–Q4, the modal
          renders after QuarterBreak commits the lineup + advances the
          quarter, gating the local clock start on the GM's whistle
          tap. handleStartFirstQuarter (Q1) writes the server
          quarter_start AND starts the clock in one step; startClock
          (Q2–Q4) only starts the local clock since QuarterBreak
          already wrote the server event. */}
      {!isFinished &&
        !quarterEnded &&
        // A running clock is implicit kickoff — don't ever pop the
        // modal over an active quarter. Covers fresh-mount auto-
        // resume (initedGameIdRef branch in the init effect) and
        // the pause/resume case where the coach taps the clock pill
        // from inside the quarter. The Q-break advance path leaves
        // clockStartedAt null, so this guard doesn't suppress the
        // intended kickoff modal there.
        clockStartedAt === null &&
        kickoffAckQuarter !== currentQuarter &&
        !startModalDismissed && (
          <StartQuarterModal
            quarter={isPreGame ? 1 : currentQuarter}
            loading={isPending}
            onStart={() => {
              // Mark the quarter we're ABOUT to be in as
              // kicked-off so a later pause/resume via clock-tap
              // doesn't re-show the modal. For Q1 pre-game,
              // handleStartFirstQuarter calls beginNextQuarter
              // which advances currentQuarter from 0→1, so we
              // ack 1, not 0. For Q2+, QuarterBreak has already
              // advanced; currentQuarter is the right value.
              // The flag is preserved across this advance by the
              // useEffect's prev-matches check, then cleared on
              // the NEXT real quarter transition.
              setKickoffAckQuarter(isPreGame ? 1 : currentQuarter);
              if (isPreGame) handleStartFirstQuarter();
              else startClock();
            }}
            onCancel={() => setStartModalDismissed(true)}
          />
        )}

      {subModalOpen && (
        <SubDueModal onAcknowledge={handleSubModalAcknowledge} />
      )}

      {walkthroughOpen && (
        <WalkthroughModal
          steps={walkthroughSteps}
          skipWelcome={walkthroughSkipWelcome}
          onClose={handleWalkthroughClose}
        />
      )}

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
        return (
          <LockModal
            player={p}
            currentLock={currentLock}
            currentZone={lockModal.zone}
            isInjured={isInjured}
            isLoaned={isLoaned}
            seasonLoanMins={seasonLoanMins}
            squadLoanMins={squadLoanMins}
            onLockField={() => {
              setLocked(lockModal.playerId, true);
              setLockModal(null);
            }}
            onLockZone={() => {
              if (lockModal.zone) setZoneLocked(lockModal.playerId, lockModal.zone);
              setLockModal(null);
            }}
            onUnlock={() => {
              setLocked(lockModal.playerId, false);
              setZoneLocked(lockModal.playerId, null);
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
            zone={injuryReplacementModal.zone}
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
        const fieldIds = ALL_ZONES.flatMap((z) => lineup[z]);
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
              subLabel: onFieldZone
                ? onFieldZone.toUpperCase()
                : "Bench",
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
            // For BEHINDS, surface a "Rushed (no scorer)" row at the
            // top of the picker. AFL real-game scenario: the ball
            // deflects through the small posts off the opposition or
            // is rushed off our own boot. The behind counts for our
            // team but has no individual scorer, so it can't go
            // through the player-attribution path. Goals don't get
            // this option — every goal in junior footy has a scorer
            // (and an unattributed goal would always be a logging
            // error worth catching).
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
                : undefined
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
                const elapsed_ms = scaledElapsedMs();
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
        />
      )}

      {songUrl && isYouTubeUrl(songUrl) && (
        <div
          ref={ytContainerRef}
          style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}
          aria-hidden
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
      {isLivePlay && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(26,30,26,0.04)]">
          <div className="mx-auto max-w-4xl">
            {gameHeader}
            {/* Undo last score — moved into the sticky bar so
                the affordance lives with the scorebug it's
                undoing (Steve 2026-05-13: "should also be at
                the bottom of it, there should be just enough
                room"). Toast (8s, dark bg) then persistent
                chip (muted bg) until the next score replaces
                it. Same gates as before — lastScore present,
                not pre-game, not finished. */}
            {lastScore && !isPreGame && !isFinished && (
              <div
                className={`mx-4 mb-1 flex items-center justify-between rounded-sm px-3 py-1.5 transition-colors ${
                  undoToastVisible ? "bg-ink text-warm" : "bg-surface-alt"
                }`}
              >
                <span
                  className={`text-xs ${undoToastVisible ? "text-warm/80" : "text-ink-dim"}`}
                >
                  {undoToastVisible
                    ? `${lastScore.forTeam === "us" ? teamName : opponentName} ${lastScore.kind}${lastScore.playerName ? ` — ${lastScore.playerName}` : ""}`
                    : "Undo last score"}
                </span>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={isPending}
                  className={`font-mono text-xs font-bold uppercase tracking-micro transition-colors disabled:opacity-60 ${
                    undoToastVisible ? "text-warn hover:text-warn/80" : "text-brand-700 hover:text-brand-600"
                  }`}
                >
                  Undo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
