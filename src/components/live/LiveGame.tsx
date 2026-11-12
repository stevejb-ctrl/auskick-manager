"use client";

import { SFButton } from "@/components/sf";
import { useOtherPhoneScores } from "@/components/live/useOtherPhoneScores";
import { WENT_HOME_REASON } from "@/lib/live/wentHome";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import {
  clockElapsedMs,
  formatClock,
  useLiveGame,
} from "@/lib/stores/liveGameStore";
import { enqueueLiveAction, pendingWriteCount } from "@/lib/live/registerLiveActions";
import { aflStoreLocks, type PlayerLock } from "@/lib/live/locks";
import { hapticTap, hapticSiren, hapticSuccess } from "@/lib/haptics";
import { LongPressHint } from "@/components/live/LongPressHint";
import { Button } from "@/components/ui/Button";
import { ZONE_SHORT } from "@/components/live/Field";
import { GameHeader } from "@/components/live/GameHeader";
import { ScoresSheet } from "@/components/live/ScoresSheet";
import { SwapDoneToast } from "@/components/live/SwapDoneToast";
import { undoSwaps } from "@/lib/live/liveChrome";
import { useSquadNames } from "@/components/live/SquadNames";
import { KidSlot, KidTile, type KidOutKind } from "@/components/live/KidTile";
import { FieldLines, ovalField, type FieldLine } from "@/components/live/FieldLines";
import { KidBench } from "@/components/live/KidBench";
import { InfoLine } from "@/components/live/InfoLine";
import { PairsSheet, type SheetPair } from "@/components/live/PairsSheet";
import { KidBar, KidBarMore, TimeSplit } from "@/components/live/KidBar";
import { LateArrivalMenu } from "@/components/live/LateArrivalMenu";
import { barButton, BAR_SMALL } from "@/components/live/barButtons";
import { kidWords, type KidOut, type KidSubRole } from "@/lib/live/kidWords";
import { minBarText, pctOfGame } from "@/lib/live/minGameTime";
import { formationRows } from "@/lib/live/formationRows";
import { fitSeats, sameSeats, seatLabels, seatOf, type SeatPosition, type Seats } from "@/lib/live/positionSeats";
import { positionSwapToast } from "@/lib/live/positionSwap";
import { aflMinTimeStates, type AflBigField } from "@/lib/sports/afl/bigField";
import { LiveShell } from "@/components/live/LiveShell";
import { LiveGameMenu, settingsSummary } from "@/components/live/LiveGameMenu";
import { PlanNextChip } from "@/components/live/PlanNextChip";
import { StartBarButton } from "@/components/live/StartBarButton";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import { AflWalkthroughOffer } from "@/components/live/WalkthroughOffer";
import { reopenLineup } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { emptyLineup } from "@/lib/types";
import { QuarterBreak } from "@/components/live/QuarterBreak";
import { buildWalkthroughSteps } from "@/components/live/WalkthroughModal";
import { ClockMenu } from "@/components/live/ClockMenu";
import { playSubDueBeep, useSubDueAudioUnlock } from "@/lib/live/subDueBeep";
import { GameSummaryCard } from "@/components/live/GameSummaryCard";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import type { InjuryReplacementCandidate } from "@/components/live/InjuryReplacementModal";
import { periodPhase } from "@/lib/live/periodPhase";
import { useScrollToTopOnFinish } from "@/lib/live/useScrollToTopOnFinish";
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
// The pieces the game will need with no signal load once the screen is up,
// while there's signal: a lazy chunk fetched at the siren with none
// crashed the page to "Loading chunk … failed" (round-3 offline testing,
// 24 Oct 2026). The bundle on first load stays as lean as before.
const OFFLINE_CHUNKS = [
  () => import("@/components/live/QuarterEndModal"),
  () => import("@/components/live/FullTimeReview"),
  () => import("@/components/live/LockModal"),
  () => import("@/components/live/InjuryReplacementModal"),
  () => import("@/components/live/ManualEndQuarterConfirm"),
];
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
import type { Game, Lineup, Player, PositionModel, Zone } from "@/lib/types";
import {
  projectUpcomingRotation,
  withPinnedPeriods,
  hasPinnedPeriod,
  consumePeriodPin,
  withoutSubPin,
  resolveDisplaySuggestions,
  swapsEqual,
  applyInlineSwapOverride,
  eligibleOffReplacements,
  eligibleOnReplacements,
  isPairEdited,
  availablePlayersForPlan,
  clearPeriodToBench,
  setPeriodGroups,
  type GamePlan,
} from "@/lib/game-plan";
import { rotateLines } from "@/lib/live/rotateLines";
import { positionsFor, ZONE_LABELS, ZONE_SHORT_LABELS } from "@/lib/ageGroups";
import { getSportConfig } from "@/lib/sports/registry";
import { endPeriodWords } from "@/lib/sports/words";
import { PlayerInsightSummary } from "@/components/live/PlayerInsightSummary";
import { useHypeSong } from "@/lib/live/useHypeSong";
import { isFinalSubWindow, canPlanNextPeriod } from "@/lib/live/subCadence";
import { mergeSubAnchor, type SubAnchor } from "@/lib/live/subAnchor";
import { clockPauseInput, storeClockFromMark, withQueuedClockPauseMark } from "@/lib/live/clockPause";
import { onQueueSaved, useWriteQueue } from "@/lib/live/writeQueue";
import { LiveTopBar } from "@/components/live/LiveTopBar";

import { assignPositionLabels, type AflPlaybookInput } from "@/lib/sports/afl/engine";
import { useOneUndo } from "@/components/live/useOneUndo";
import { swapsUndoneText, swapUndoLabel, type UndoEvent } from "@/lib/live/lastUndoable";
import { AFL_SCORE_TYPES, stackIds, stackRef, undoStack, type StackScore } from "@/lib/live/undoStack";
import { noteLiveResult, requestLiveSync } from "@/lib/live/liveSync";
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
  /**
   * Big fields (live v3, Phase 11): AFL 15/16/18 a side with named
   * positions is drawn as its formation, each kid in their seat ("CHB
   * Jack S"), and tapping two kids on the field trades their positions
   * (position_swap). Omitted: the zone lines, as small sides have.
   */
  bigField?: AflBigField;
  /**
   * ms each kid couldn't play so far (late, hurt, lent; aflAwayMs): off
   * their game for the rotation rule's minimum ("Needs 6′ more").
   */
  awayMs?: Record<string, number>;
  exitHref?: string;
  /**
   * True when the current user has admin role on this team. Drives
   * the "Restart game" affordance — folded into the same row as
   * "+ Add late arrival" at the bottom of LiveGame so the two
   * destructive/utility actions share one strip of scrolling real
   * estate (Steve 2026-05-13).
   */
  isAdmin?: boolean;
  /**
   * The game's scores still standing, from the server (lib/live/undoStack):
   * Undo goes back through them, not just this phone's last tap.
   */
  standingScores: StackScore[];
  /** Every score the server has, standing or taken back (savedScoreKeys). */
  savedScoreKeys?: string[];
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

/**
 * The store shows what the server's replay does: the same quarter and
 * phase, score and who's where. A difference with nothing of this phone's
 * in flight is the other phone's doing.
 */
function storeMatchesServer(
  store: {
    currentQuarter: number;
    quarterEnded: boolean;
    finalised: boolean;
    teamScore: { goals: number; behinds: number };
    opponentScore: { goals: number; behinds: number };
    playerScores: Record<string, { goals: number; behinds: number }>;
    lineup: Lineup;
    injuredIds: string[];
    loanedIds: string[];
    seats: Seats | null;
  },
  server: GameState,
  /** Big fields: who's in which position on the server; undefined elsewhere. */
  serverSeats?: Seats | null,
): boolean {
  // A position change inside a line moves nobody between lines.
  if (serverSeats !== undefined && !sameSeats(store.seats, serverSeats)) return false;
  if (store.currentQuarter !== server.currentQuarter) return false;
  if (store.quarterEnded !== server.quarterEnded || store.finalised !== server.finalised) return false;
  if (store.teamScore.goals !== server.teamScore.goals || store.teamScore.behinds !== server.teamScore.behinds) return false;
  if (store.opponentScore.goals !== server.opponentScore.goals || store.opponentScore.behinds !== server.opponentScore.behinds) return false;
  // Who scored, too: Scores and fixes changing a scorer moves no total
  // (Stagehand, 9 Nov 2026), and the old kid's tile kept the score.
  const scorers = new Set([...Object.keys(store.playerScores), ...Object.keys(server.playerScores)]);
  for (const id of Array.from(scorers)) {
    const a = store.playerScores[id] ?? { goals: 0, behinds: 0 };
    const b = server.playerScores[id] ?? { goals: 0, behinds: 0 };
    if (a.goals !== b.goals || a.behinds !== b.behinds) return false;
  }
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id));
  if (!same(store.injuredIds, server.injuredIds) || !same(store.loanedIds, server.loanedIds)) return false;
  if (!server.lineup) return true;
  const zones: (keyof Lineup)[] = ["back", "hback", "mid", "hfwd", "fwd", "bench"];
  return zones.every((z) => same(store.lineup[z] ?? [], server.lineup?.[z] ?? []));
}

type LastScore = {
  kind: "goal" | "behind";
  forTeam: "us" | "opponent";
  playerId: string | null;
  quarter: number;
  /**
   * The score's write (its op id, the event's idempotency key): Undo
   * takes back this one, never "the latest", which may be the other
   * phone's (UX round 2).
   */
  key: string;
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
  bigField,
  awayMs,
  exitHref,
  isAdmin = false,
  standingScores,
  savedScoreKeys = [],
  songUrl,
  songStartSeconds = 0,
  songDurationSeconds = 15,
  clockMultiplier = 1,
  quarterMs,
  ageGroup,
}: LiveGameProps) {
  const names = useSquadNames();
  const activeZones = useMemo(() => positionsFor(positionModel), [positionModel]);
  // F3 (Phase 12): labelled zones for the long-press player summary, derived
  // from the AFL sport config in display order and filtered to this age
  // group's zones (D-03 — never a hardcoded ALL_ZONES). Shared,
  // sport-agnostic PlayerInsightSummary renders them.
  const insightZones = useMemo(
    () => getSportConfig("afl").zones.filter((z) => ageGroup.zones.includes(z.id)),
    [ageGroup.zones],
  );
  // Big fields: the positions the seats are for (key, label, line).
  const seatPositions = useMemo<SeatPosition[] | null>(
    () => bigField?.positions.map((p) => ({ key: p.key, label: p.label, line: p.line as Zone })) ?? null,
    [bigField],
  );
  const init = useLiveGame((s) => s.init);
  const lineup = useLiveGame((s) => s.lineup);
  const storeSeats = useLiveGame((s) => s.seats);
  const applyPositionSwap = useLiveGame((s) => s.applyPositionSwap);
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
  const restoreClock = useLiveGame((s) => s.restoreClock);
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
  // Live v3: the ⋯ game menu (LiveGameMenu), and Start Q1's confirm on
  // the pre-kickoff bar.
  const [menuOpen, setMenuOpen] = useState(false);
  const [startQ1Open, setStartQ1Open] = useState(false);

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
  // The sub clock: where the quarter's sub interval started (its last
  // planned swap) and a due batch's swaps still to make. The events'
  // anchor seeds it (a reload, a new quarter) and this phone's own swaps
  // move it (mergeSubAnchor, below).
  const [subAnchor, setSubAnchor] = useState<SubAnchor | null>(null);
  // The clock_pause events this phone wrote (by op id), and the last one
  // the clock was set from: a pause another phone made is applied once.
  const ownClockOpsRef = useRef(new Set<string>());
  const appliedClockMarkRef = useRef<string | null>(null);
  // Set when the last of the writes a reload left in the queue saves:
  // the next init takes the server's game (round 3, 24 Oct 2026: after
  // a reconnect the screen kept the lineup from before the offline subs
  // while the database had them, until a manual reload).
  const resyncAfterQueueRef = useRef(false);
  // Swaps made on this phone, stamped in the replay's absolute game-ms
  // frame. The recency guard's lastSubbedOn/OffMs come from the server
  // replay, which a mid-quarter swap doesn't refresh — so without these
  // the kid just swapped off was suggested straight back on (round 5).
  const [localSubbedMs, setLocalSubbedMs] = useState<{
    on: Record<string, number>;
    off: Record<string, number>;
  }>({ on: {}, off: {} });
  // An empty spot tapped with nobody selected: pick who comes on there
  // (the break does the same). It used to do nothing, so after lending a
  // kid mid-quarter the gap couldn't be filled from the spot (Stagehand
  // round 4).
  const [fillZone, setFillZone] = useState<Zone | null>(null);
  // Big fields: the empty position the fill sheet is for.
  const [fillSeat, setFillSeat] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const prevSubStateRef = useRef<"idle" | "soft" | "due">("idle");
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
    /** Why they're coming off: hurt (the default), gone home, or lent. */
    reason?: "went_home" | "lent";
  } | null>(null);
  // Kids who went home (an injury with reason "out", lib/live/wentHome):
  // the replay's, then this phone's taps until the server catches up.
  const [wentHomeIds, setWentHomeIds] = useState<string[]>(initialState.wentHomeIds ?? []);
  const serverWentHome = (initialState.wentHomeIds ?? []).join(",");
  useEffect(() => {
    setWentHomeIds(serverWentHome ? serverWentHome.split(",") : []);
  }, [serverWentHome]);
  const wentHomeSet = useMemo(() => new Set(wentHomeIds), [wentHomeIds]);

  // Undo-score state
  // Undo goes back through every standing score, one per tap, as every
  // other sport's does: the server's, plus this phone's taps it hasn't
  // got yet, less the ones this phone took back. It used to hold only
  // this phone's last tap, so after one undo, a reload or the other
  // phone's score there was nothing to undo until the break (usability
  // pass, 26 Oct 2026).
  const [localScores, setLocalScores] = useState<StackScore[]>([]);
  const [undoneScoreIds, setUndoneScoreIds] = useState<ReadonlySet<string>>(() => new Set());
  // A score from the other phone says so (Stagehand round 8, #6): AFL
  // holds its scores as the standing list.
  const standingAsEvents = useMemo(
    () => standingScores.map((s) => ({
        id: s.eventId ?? `optimistic-${s.key}`,
        type: s.type,
        idempotency_key: s.key,
        created_at: s.createdAt ?? "",
        player_id: s.playerId,
      })),
    [standingScores],
  );
  useOtherPhoneScores(standingAsEvents, AFL_SCORE_TYPES, { teamName, opponentName });
  const undoScores = undoStack(standingScores, localScores, undoneScoreIds, savedScoreKeys);
  // The one Undo (useOneUndo): the newest score or swap of this phone's,
  // else the game's latest score, named on the strip. The stack is
  // already the scores standing, so it goes over as events in order (a
  // tap still on its way after every saved one).
  const oneUndo = useOneUndo({
    events: undoScores.map((s, i) => ({
      id: s.eventId ?? `optimistic-${s.key}`,
      type: s.type,
      player_id: s.playerId,
      created_at: s.createdAt ?? `￿${String(i).padStart(4, "0")}`,
      idempotency_key: s.key,
      metadata: { quarter: s.quarter },
    })),
    scoreTypes: AFL_SCORE_TYPES,
    period: currentQuarter >= 1 && !quarterEnded && !finalised ? currentQuarter : null,
    teamName,
    opponentName,
    firstName: shortName,
  });

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

  // The pairs sheet (live v3): the planned sub, pair by pair, from the
  // info line or the due bar's PAIRS. It replaced the swap card's open
  // view. (The dock's "Swap player" picker went with the dock: the kid
  // bar says "Tap another kid to swap", and every kid is a tap away.)
  const [pairsOpen, setPairsOpen] = useState(false);

  // The Scores and fixes sheet (live/ScoresSheet): the Q-by-Q table,
  // then every score to take off or add. Opened from under the clock
  // and from the utility row, for whoever's running the game.
  const [scoresOpen, setScoresOpen] = useState(false);

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
    // Ahead because this phone started a quarter the server hasn't got
    // yet (Start is queued, and with no signal it waits): not a restart.
    // A refresh landing first would otherwise put the break back.
    const startQueued = useWriteQueue
      .getState()
      .queue.some((op) => op.kind === "startQuarter" && op.args[1] === gameId);
    const storeAheadOfServer = storeQuarter > initialState.currentQuarter && !startQueued;
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
    // Writes a reload left in the write queue have since saved (below):
    // this screen drew the server's game without them, so take the
    // server's game again rather than keep the store's.
    const resync = resyncAfterQueueRef.current;
    resyncAfterQueueRef.current = false;
    // Another phone on this game (a parent's game-day link, a co-manager)
    // moved it on — scored, subbed, started or ended a quarter, finished —
    // and LiveSync refreshed the page with it. The store only follows its
    // own taps, so the coach's phone kept the old score and quarter until
    // a reload (UX round 2). With nothing of this phone's still on its way
    // to the server, the server's replay is the game: take it, keeping
    // this phone's clock in the quarter they share.
    const otherPhoneMovedOn =
      initedGameIdRef.current === gameId &&
      fullStoreState.activeGameId === gameId &&
      !storeAheadOfServer &&
      pendingWriteCount() === 0 &&
      !storeMatchesServer(fullStoreState, initialState, bigField ? bigField.seats : undefined);
    // A big field the store isn't keeping seats for (it was filled before
    // this screen knew the positions): take the server's game, seats and all.
    const seatsMissing = !!seatPositions && fullStoreState.seatPositions === null;
    if (
      fullStoreState.activeGameId === gameId &&
      !storeAheadOfServer &&
      lineupHasAnyPlayer &&
      !resync &&
      !otherPhoneMovedOn &&
      !seatsMissing
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
    const isFreshMount = initedGameIdRef.current !== gameId || resync;
    initedGameIdRef.current = gameId;

    let clockStartedAt: number | null = null;
    let accumulatedMs = 0;
    if (
      !initialState.quarterEnded &&
      !initialState.finalised &&
      initialState.currentQuarter >= 1 &&
      initialState.quarterStartedAt
    ) {
      // The quarter's latest pause or resume (its clock_pause event,
      // or one still queued from before the reload): the clock is held
      // at the pause, or runs on from the resume with the stoppage
      // banked. A rebuild from quarter_start alone counted the paused
      // seconds as play (round 2, 24 Oct 2026).
      const mark = isFreshMount
        ? withQueuedClockPauseMark(
            initialState.clockPause,
            useWriteQueue.getState().queue,
            gameId,
            initialState.currentQuarter,
          )
        : null;
      if (mark) {
        const clock = storeClockFromMark(mark, Date.now(), clockMultiplier);
        accumulatedMs = clock.accumulatedMs;
        clockStartedAt = clock.running ? Date.now() : null;
        appliedClockMarkRef.current = mark.key;
      } else {
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
      if (otherPhoneMovedOn) {
        if (initialState.currentQuarter === storeQuarter && !fullStoreState.quarterEnded) {
          // The quarter this phone is already timing: its clock stands.
          clockStartedAt = fullStoreState.clockStartedAt;
          accumulatedMs = fullStoreState.accumulatedMs;
        } else {
          // The other phone started it: it's running.
          clockStartedAt = Date.now();
        }
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
      // Big fields: who's in which position, from the server's replay.
      seats: bigField?.seats ?? null,
      seatPositions,
    });
    setHydrated(true);
    // bigField and seatPositions come with initialState (the same render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // A write a reload left in the queue saved, with no caller here to
  // refresh: once the last of this game's has, refresh and take the
  // server's game (resyncAfterQueueRef, above).
  useEffect(
    () =>
      onQueueSaved((op, { hadCaller }) => {
        if (hadCaller || op.args[1] !== gameId) return;
        if (useWriteQueue.getState().queue.some((q) => q.args[1] === gameId)) return;
        resyncAfterQueueRef.current = true;
        startTransition(() => router.refresh());
      }),
    [gameId, router],
  );

  // A pause or resume another phone made lands with a refresh: put the
  // clock where its event says. This phone's own are already there.
  useEffect(() => {
    if (!hydrated) return;
    const mark = initialState.clockPause;
    if (!mark || mark.key === appliedClockMarkRef.current) return;
    appliedClockMarkRef.current = mark.key;
    if (ownClockOpsRef.current.has(mark.key)) return;
    if (initialState.currentQuarter !== currentQuarter || quarterEnded || finalised) return;
    if (quarterEndTriggeredRef.current === currentQuarter) return;
    const clock = storeClockFromMark(mark, Date.now(), clockMultiplier);
    restoreClock(clock.accumulatedMs, clock.running);
  }, [hydrated, initialState, currentQuarter, quarterEnded, finalised, clockMultiplier, restoreClock]);

  // The sub clock from the events: the quarter's last planned swap (0 at
  // the start), so a reload carries on from it. It used to be re-seeded
  // on mount by flooring the clock onto the interval grid, before the
  // clock was back, so a reload just after subbing brought "Sub due —
  // NOW" straight back (round 2, 24 Oct 2026). The phone's own swaps
  // win over events that haven't caught up (mergeSubAnchor).
  const serverHasQuarter = initialState.currentQuarter === currentQuarter && !initialState.quarterEnded;
  const serverSubAnchorMs = serverHasQuarter ? initialState.subAnchorMs : null;
  const serverSubBatchLeft = serverHasQuarter ? initialState.subBatchLeft : 0;
  useEffect(() => {
    if (!hydrated) return;
    if (currentQuarter >= 1 && !quarterEnded && !finalised) {
      setSubAnchor((mine) =>
        mergeSubAnchor(mine, { period: currentQuarter, anchorMs: serverSubAnchorMs, batchLeft: serverSubBatchLeft }),
      );
    } else {
      setSubAnchor(null);
    }
  }, [hydrated, currentQuarter, quarterEnded, finalised, serverSubAnchorMs, serverSubBatchLeft]);
  const subBaseMs = subAnchor?.period === currentQuarter ? subAnchor.anchorMs : null;
  const subBatchLeft = subAnchor?.period === currentQuarter ? subAnchor.batchLeft : 0;

  function handleTapField(playerId: string, zone: Zone) {
    if (isFinished) return;
    // Big fields: a kid on the field, then another, trade positions
    // (CHB ↔ FB, or CHB ↔ C across lines). Not a sub.
    if (seatPositions && playerId !== "" && selected?.kind === "field" && selected.playerId !== playerId) {
      swapPositions(selected.playerId, playerId, null);
      return;
    }
    if (playerId === "") {
      if (selected?.kind === "bench") {
        clearSelection();
        manualSwap("", selected.playerId, zone);
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
      manualSwap(playerId, selected.playerId, zone);
      return;
    }
    // Two different field players in different zones — swap their zones directly.
    if (selected.zone !== zone) {
      swapZones(selected.playerId, selected.zone, playerId, zone, true);
      return;
    }
    selectField(playerId, zone);
  }

  // Two field kids trade zones at once (no confirm, as AFL always has),
  // with Undo on the toast: two quick taps swapped kids by accident and
  // only a manual swap back fixed it (Stagehand round 8, #14).
  function swapZones(pidA: string, zoneA: Zone, pidB: string, zoneB: Zone, withUndo: boolean) {
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    applyFieldZoneSwap(pidA, zoneA, pidB, zoneB);
    showSwapToast(
      `${shortName(pidA)} ⇄ ${shortName(pidB)} — zones swapped`,
      withUndo ? () => swapZones(pidA, zoneB, pidB, zoneA, false) : undefined,
      `${shortName(pidA)} and ${shortName(pidB)} swapping zones`,
    );
    enqueueLiveAction("recordFieldZoneSwap", [
      auth,
      gameId,
      {
        player_a_id: pidA,
        zone_a: zoneA,
        player_b_id: pidB,
        zone_b: zoneB,
        quarter,
        elapsed_ms,
      },
    ]);
  }

  // Big fields (live v3, Phase 11): who's in which position now, fitted
  // to the lineup.
  function seatsNow(): Seats | null {
    if (!seatPositions) return null;
    const st = useLiveGame.getState();
    return fitSeats(st.seats, st.lineup, seatPositions).seats;
  }
  const seatLabel = (key: string) => seatPositions?.find((p) => p.key === key)?.label ?? key;

  // Two kids on the field trade named positions, or one moves to an
  // empty position (`toKey`). It's not a sub: the sub clock and the
  // swap count stand. At once, with Undo on the toast for 6 s ("Jack S
  // to FB · Tom to CHB · position change logged"); Undo writes the
  // change back as its own position_swap, marked undo.
  function swapPositions(pidA: string, pidB: string | null, toKey: string | null, undo = false) {
    const seats = seatsNow();
    if (!seats || !seatPositions) return;
    const st = useLiveGame.getState();
    const posA = seatOf(seats, pidA);
    const posB = pidB ? seatOf(seats, pidB) : toKey;
    // Nowhere to go, or the empty position isn't empty any more.
    if (!posA || !posB || posA === posB || (!pidB && seats[posB] !== null)) {
      clearSelection();
      return;
    }
    const zoneA = ALL_ZONES.find((z) => st.lineup[z].includes(pidA));
    const zoneB = pidB
      ? ALL_ZONES.find((z) => st.lineup[z].includes(pidB))
      : seatPositions.find((p) => p.key === posB)?.line;
    if (!zoneA || !zoneB) {
      clearSelection();
      return;
    }
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    applyPositionSwap(pidA, zoneA, pidB ?? "", zoneB, posB);
    showSwapToast(
      positionSwapToast(
        { name: shortName(pidA), to: seatLabel(posB) },
        pidB ? { name: shortName(pidB), to: seatLabel(posA) } : null,
      ),
      undo
        ? undefined
        : () => {
            // Put it back while both are still where the change left them.
            const now = seatsNow();
            if (!now || now[posB] !== pidA || now[posA] !== (pidB ?? null)) return;
            swapPositions(pidA, pidB, pidB ? null : posA, true);
          },
    );
    enqueueLiveAction("recordPositionSwap", [
      auth,
      gameId,
      {
        player_a_id: pidA,
        player_b_id: pidB,
        position_a: posA,
        position_b: posB,
        zone_a: zoneA,
        zone_b: zoneB,
        quarter,
        elapsed_ms,
        ...(undo ? { undo: true } : {}),
      },
    ]);
  }

  // Big fields: an empty position tapped. A picked field kid moves
  // there; a picked bench kid comes on into it; else who comes on?
  function handleTapSeat(key: string, zone: Zone) {
    if (isFinished) return;
    if (selected?.kind === "field") {
      swapPositions(selected.playerId, null, key);
      return;
    }
    if (selected?.kind === "bench") {
      const on = selected.playerId;
      clearSelection();
      manualSwap("", on, zone, key);
      return;
    }
    setFillSeat(key);
    setFillZone(zone);
  }

  // A sub made by hand (tap-tap, the dock's Swap player, a bench kid
  // into an empty spot) happens at once, off the sub cadence, and the
  // toast carries Undo for 6 s. Live v3 (Steve, 8 Nov 2026) dropped the
  // "Manually sub…?" confirm. Undo writes the swap back as its own
  // event (marked `undo`, so it nets to no sub), on the same write
  // queue, so it saves after the swap even with no signal. A kid into an
  // empty spot (`off` "") has nobody to bring back: no Undo.
  function manualSwap(off: string, on: string, zone: Zone, position: string | null = null) {
    persistSwap(off, on, zone, false, 0, false, position);
    if (!off) {
      showSwapToast(`${shortName(on)} on`);
      return;
    }
    showSwapToast(`${shortName(off)} → ${shortName(on)}`, () => {
      // Where the kid who came on is now (a zone swap may have moved
      // them since); nothing to put back if either has moved on.
      const now = useLiveGame.getState().lineup;
      const at = ALL_ZONES.find((z) => now[z].includes(on));
      if (!at || !now.bench.includes(off)) return;
      persistSwap(on, off, at, false, 0, true);
    }, swapUndoLabel([{ off, on }], shortName));
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
      manualSwap(selected.playerId, playerId, selected.zone);
      return;
    }
    selectBench(playerId);
  }

  function startUndoToast(score: LastScore) {
    const local: StackScore = {
      eventId: null,
      key: score.key,
      type: score.forTeam === "us" ? score.kind : `opponent_${score.kind}`,
      playerId: score.playerId,
      quarter: score.quarter,
    };
    setLocalScores((prev) => [...prev, local]);
    oneUndo.scored(score.key, undoScoreMessage(local));
  }

  // "Jack", or "Jack S" beside another Jack (SquadNames).
  function shortName(playerId: string): string {
    const p = playersById.get(playerId);
    if (!p) return "Player";
    return names.first(p);
  }

  // The toast says what changed. With `putBack`, the undo strip's one
  // Undo offers it ("Undo: Ava on for Leo", `undoLabel`) while it's the
  // last thing done; the toast has no Undo of its own (Stagehand round 9).
  function showSwapToast(text: string, putBack?: () => void, undoLabel?: string) {
    if (swapToastTimerRef.current !== null) clearTimeout(swapToastTimerRef.current);
    setSwapToast(text);
    swapToastTimerRef.current = setTimeout(() => setSwapToast(null), 2500);
    if (putBack) {
      const label = undoLabel ?? text;
      oneUndo.changed({
        label,
        run: () => {
          putBack();
          showSwapToast(swapsUndoneText(label));
        },
      });
    } else oneUndo.other();
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
    const { id: key } = enqueueLiveAction(kind === "goal" ? "recordGoal" : "recordBehind", [
      auth,
      gameId,
      { player_id: playerId, quarter, elapsed_ms },
    ]);
    startUndoToast({
      kind,
      forTeam: "us",
      playerId,
      quarter,
      key,
    });
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
    const { id: key } = enqueueLiveAction("recordGoal", [
      auth,
      gameId,
      { player_id: null, quarter, elapsed_ms, unattributed: true },
    ]);
    startUndoToast({
      kind: "goal",
      forTeam: "us",
      playerId: null,
      quarter,
      key,
    });
  }

  // Rushed behind: ball deflects through off the opposition (or
  // self-rushed). Counts +1 for our team but has no scorer, so it
  // skips the per-player tally and never plays the goal song.
  function recordRushedBehind() {
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    incTeam("behinds");
    const { id: key } = enqueueLiveAction("recordBehind", [
      auth,
      gameId,
      { player_id: null, quarter, elapsed_ms, rushed: true },
    ]);
    startUndoToast({
      kind: "behind",
      forTeam: "us",
      playerId: null,
      quarter,
      key,
    });
  }

  function handleScore(kind: "goal" | "behind") {
    if (!selected || selected.kind !== "field") return;
    const playerId = selected.playerId;
    clearSelection();
    recordPlayerScore(playerId, kind);
  }

  function handleInjuryToggle(playerId: string, injured: boolean, wentHome = false) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    setInjured(playerId, injured);
    noteWentHome(playerId, injured && wentHome);
    enqueueLiveAction("markInjury", [
      auth,
      gameId,
      { player_id: playerId, injured, quarter, elapsed_ms, ...(injured && wentHome ? { reason: WENT_HOME_REASON } : {}) },
    ]);
  }

  function noteWentHome(playerId: string, home: boolean) {
    setWentHomeIds((prev) => (home ? [...prev.filter((p) => p !== playerId), playerId] : prev.filter((p) => p !== playerId)));
  }

  // Combined injury + bench-replacement swap. Used when the coach picks a
  // replacement in InjuryReplacementModal — fires the atomic store action
  // and persists both events to the server (injury + swap) in parallel.
  // Mirrors persistSwap's sub-timer reset so the next sub-due alert fires
  // a fresh interval after the forced rotation.
  function handleInjuryReplacement(
    injuredId: string,
    replacementId: string,
    zone: Zone,
    wentHome = false,
  ) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    // Issue 5: a forced injury/lent replacement is off-cadence — it must
    // NOT reset the sub countdown. Leave the sub anchor alone so the
    // timer keeps running toward the next scheduled rotation (the events
    // skip it too: lib/live/subAnchor matches it to its injury).
    applyInjurySwap(injuredId, replacementId);
    noteWentHome(injuredId, wentHome);
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
        ...(wentHome ? { reason: WENT_HOME_REASON } : {}),
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
    const { id: key } = enqueueLiveAction("recordOpponentScore", [
      auth,
      gameId,
      { kind, quarter, elapsed_ms },
    ]);
    startUndoToast({ kind, forTeam: "opponent", playerId: null, quarter, key });
  }

  // "Roos goal — Mia": what Undo takes back.
  function undoScoreMessage(score: StackScore): string {
    const ours = !score.type.startsWith("opponent_");
    const kind = score.type.endsWith("behind") ? "behind" : "goal";
    const who = ours && score.playerId ? ` — ${shortName(score.playerId)}` : "";
    return `${ours ? teamName : opponentName} ${kind}${who}`;
  }

  // The strip's Undo of a score: the one it names (useOneUndo).
  function handleUndo(named: UndoEvent) {
    const undoTop = undoScores.find((s) => (s.eventId !== null && s.eventId === named.id) || (s.key !== null && s.key === named.idempotency_key));
    if (!undoTop) return;
    const forTeam = undoTop.type.startsWith("opponent_") ? "opponent" : "us";
    const kind: "goal" | "behind" = undoTop.type.endsWith("behind") ? "behind" : "goal";
    const { playerId, quarter } = undoTop;

    if (forTeam === "us") {
      undoTeamScore(kind === "goal" ? "goals" : "behinds");
      if (playerId) undoPlayerScore(playerId, kind === "goal" ? "goals" : "behinds");
    } else {
      undoOpponentScore(kind === "goal" ? "goals" : "behinds");
    }

    setUndoneScoreIds((prev) => new Set(Array.from(prev).concat(stackIds(undoTop))));

    const serverKind = undoTop.type as "goal" | "behind" | "opponent_goal" | "opponent_behind";

    // On the game's write-queue lane, so it can't overtake its score.
    // It names the score (its event, or its write's key). Refused because
    // the other phone already took it back: the store catches up from
    // the server.
    const { flushed } = enqueueLiveAction("undoLastScore", [
      auth,
      gameId,
      { kind: serverKind, quarter, playerId: playerId ?? null, target: stackRef(undoTop) },
    ]);
    flushed.catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Couldn't undo that score.");
      requestLiveSync();
    });
  }

  // `resetSubTimer` = was this the PLANNED rotation tick? A scheduled
  // rotation (the suggested-swap apply) resets the countdown to a full
  // interval (issue 5). A deliberate off-cadence manual swap leaves it
  // running toward the next scheduled rotation (issue 5 open question,
  // default "keep running"), and says so (`manual`) so the anchor a
  // reload rebuilds skips it too. Forced injury/lent swaps go through
  // their own path and never reset.
  // `batchLeft`: one swap of a due batch, with this many still to make.
  // The countdown holds (still due) until the batch is done, as soccer's
  // does; it used to restart and drop the batch's other pair (round 2,
  // 24 Oct 2026).
  function persistSwap(
    off: string,
    on: string,
    zone: Zone,
    resetSubTimer = true,
    batchLeft = 0,
    /** "Undo swaps" putting one back: it nets to zero subs (replayGame's subCount). */
    undo = false,
    /** Big fields: the empty position the kid comes on into. */
    position: string | null = null,
  ) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    if (resetSubTimer) {
      setSubAnchor({
        period: currentQuarter,
        anchorMs: batchLeft > 0 ? subBaseMs ?? 0 : elapsed_ms,
        batchLeft,
      });
    }
    const at = initialState.completedQuarterMs + elapsed_ms;
    setLocalSubbedMs((prev) => ({
      on: { ...prev.on, [on]: at },
      off: { ...prev.off, [off]: at },
    }));
    applySwap(off, on, zone, position);
    enqueueLiveAction("recordSwap", [
      auth,
      gameId,
      {
        off_player_id: off,
        on_player_id: on,
        zone,
        quarter,
        elapsed_ms,
        ...(resetSubTimer ? {} : { manual: true }),
        ...(resetSubTimer && batchLeft > 0 ? { batch_left: batchLeft } : {}),
        ...(undo ? { undo: true } : {}),
        ...(position ? { position } : {}),
      },
    ]);
  }

  // Start Q1 from the pre-kickoff bar (live v3, B4): the lineup picker's
  // Ready set the lineup and brought the coach here; the confirm's
  // "Start Q1 now" is the siren. As the break's Start does: the write
  // goes on the queue (no signal, it sends later), the quarter starts on
  // this phone at once, and the page refreshes once it's saved.
  function handleStartFirstQuarter() {
    setStartQ1Open(false);
    setError(null);
    // Unlock audio inside this tap, before any await (the team song).
    primeSong();
    const { flushed } = enqueueLiveAction("startQuarter", [auth, gameId, 1]);
    if (useLiveGame.getState().currentQuarter < 1) beginNextQuarter();
    startClock();
    void hapticTap("medium");
    flushed
      .then(() => startTransition(() => router.refresh()))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't start Q1."));
  }

  // ⋯ → Edit lineup, before kickoff: back to the picker with the lineup
  // as set (reopenLineup). The store goes back to its defaults, as
  // Restart's does, so the next Ready starts clean.
  function handleEditLineup() {
    setError(null);
    startTransition(async () => {
      const result = await reopenLineup(auth, gameId).catch(() => ({
        success: false as const,
        error: "Couldn't open the lineup — try again.",
      }));
      noteLiveResult(result);
      if (!result.success) {
        setError(result.error);
        return;
      }
      useLiveGame.getState().init({ activeGameId: gameId, currentQuarter: 0, lineup: emptyLineup() });
      if (auth.kind === "token") window.location.assign(`/run/${auth.token}/lineup`);
      else router.refresh();
    });
  }

  // A pause or resume is saved (clock_pause), so a reload or another
  // phone keeps it (lib/live/clockPause).
  function saveClockPause(paused: boolean, elapsedMs: number) {
    const input = clockPauseInput(Math.max(1, currentQuarter), paused, elapsedMs, Date.now());
    const { id } = enqueueLiveAction("recordClockPause", [auth, gameId, input]);
    ownClockOpsRef.current.add(id);
  }

  function handlePause() {
    if (clockStartedAt === null) return;
    const elapsed = currentElapsedMs();
    pauseClock();
    saveClockPause(true, elapsed);
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
    if (clockStartedAt !== null) return;
    startClock();
    saveClockPause(false, accumulatedMs);
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
  useEffect(() => {
    for (const load of OFFLINE_CHUNKS) void load().catch(() => {});
  }, []);

  // The summary after Finish opens at the top: the final score and Copy
  // for group chat, not the review's scroll (round 2, 24 Oct 2026).
  useScrollToTopOnFinish(finalised);

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
  // No sub is due once the siren's gone: the quarter-end modal waits on
  // the coach with quarterEnded still false, and a "Sub due" card sat
  // behind it through quarter time and full time (AFL audit, 23 Oct 2026).
  const periodClockDone = quarterEnded || showQuarterEndModal || (quarterMs > 0 && nowMs >= quarterMs);
  const msUntilDue =
    subBaseMs !== null && !isPreGame && !isFinished && !periodClockDone
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

  // Scoring in hand: the who-scored sheet is open. The hooter and the
  // sub-due alert wait for it, so a goal kicked on the siren isn't lost
  // under the quarter-end sheet (the picker-race guard, Stagehand
  // 2026-05-10; netball's who-scored sheet holds it the same way). A kid
  // picked (their kid bar up) does NOT hold it: a coach who leaves a kid
  // tapped would never hear the siren. The siren puts the kid down.
  const holdForScoring = pickScorerKind !== null;

  useEffect(() => {
    // Picker-race guard: hold the sub-due alert (beep, haptic) while
    // the coach is scoring, so it doesn't jolt them mid-pick. The
    // sub-due state stays "due" meanwhile — once the who-scored sheet
    // closes, the alert fires (subState didn't change, prevSubStateRef
    // is still "due", but we re-check on every render via this
    // effect's deps). On screen, the info line and the kids' words say
    // it (live v3): nothing pops over the field.
    if (holdForScoring) return;
    if (subState === "due" && prevSubStateRef.current !== "due") {
      playSubDueBeep();
      // Heavy impact — sub-due is "this needs your attention" but
      // not the urgency of a hooter (which gets hapticSiren below).
      // The medium-vs-heavy distinction is meaningful on iOS Taptic.
      void hapticTap("heavy");
    }
    prevSubStateRef.current = subState;
  }, [subState, holdForScoring]);

  useEffect(() => {
    return () => {
      if (swapToastTimerRef.current !== null) {
        clearTimeout(swapToastTimerRef.current);
        swapToastTimerRef.current = null;
      }
      // Song / YT cleanup moved into `useHypeSong`'s own return
      // function (Steve 2026-05-16). The hook tears down the
      // iframe + timer on unmount or gameId change.
    };
  }, []);

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
      // the user resolves attribution (holdForScoring: the sheet only).
      if (holdForScoring) return;
      if (currentElapsedMs() >= quarterMs && quarterEndTriggeredRef.current !== currentQuarter) {
        quarterEndTriggeredRef.current = currentQuarter;
        // The siren puts a picked kid down: the kid bar closes under
        // the quarter-end sheet (one sheet at a time).
        useLiveGame.getState().clearSelection();
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
  }, [clockStartedAt, accumulatedMs, quarterEnded, finalised, currentQuarter, holdForScoring]);

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
    // The quarter this break follows.
    const breakQuarter = currentQuarter;
    return (
      <div className="ui-nonselect">
        {walkthroughOverlay}
        <QuarterBreak
          wentHomeIds={wentHomeSet}
          onWentHome={(pid) => noteWentHome(pid, true)}
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
          onStarted={() => {
            // The page may already have caught up to this quarter (the
            // start's refresh landing first re-inits the store into it).
            if (useLiveGame.getState().currentQuarter <= breakQuarter) beginNextQuarter();
          }}
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
    // A due batch made one swap at a time: just the swaps it has left,
    // as soccer's card (lib/live/subAnchor openSubBatch).
    rawSuggestions: subBatchLeft > 0 ? rawSuggestions.slice(0, subBatchLeft) : rawSuggestions,
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
    // One sheet at a time (live v3): the kid is put down.
    clearSelection();
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
          ? () => setScoresOpen(true)
          : undefined
      }
      // Strip the inner card chrome when sticky-bottom (Steve
      // 2026-05-13): the wrapper carries its own bar styling and
      // a card-on-card look reads as bumpy.
      flat={isLivePlay}
    />
  );

  // ─── Live v3's shell ───────────────────────────────────────
  // Before kickoff and through the quarter the screen is LiveShell: top
  // bar, the light score header, the undo line, the info line (the next
  // sub), the field (the part that scrolls), the bench, and the bar.
  // Phase 6: the kids are KidTiles on FieldLines and a KidBench, the next
  // sub is the InfoLine and the PairsSheet, and a picked kid turns the
  // bar into their KidBar. Full time and the finished game keep their
  // page.
  const subDue = subState === "due";
  // Each kid's part in the planned sub (the pair's index, off or on, and
  // the line it's in). Pairs with someone missing aren't drawn.
  const pairOf = new Map<string, { i: number; role: "off" | "on"; s: (typeof suggestions)[number] }>();
  suggestions.forEach((s, i) => {
    if (!playersById.has(s.on_player_id)) return;
    if (s.off_player_id && !playersById.has(s.off_player_id)) return;
    if (s.off_player_id) pairOf.set(s.off_player_id, { i, role: "off", s });
    pairOf.set(s.on_player_id, { i, role: "on", s });
  });
  // Big fields: who's in which position (the store's seats, fitted to
  // the lineup). Elsewhere, set positions' labels within each line.
  const fitted = seatPositions ? fitSeats(storeSeats ?? bigField?.seats ?? null, lineup, seatPositions) : null;
  const positionLabels =
    fitted && seatPositions ? seatLabels(fitted.seats, seatPositions) : assignPositionLabels(lineup, aflPlaybook);
  // Where a bench kid goes on: the off kid's position, else the line.
  const pairTo = (s: (typeof suggestions)[number]) =>
    (s.off_player_id && positionLabels?.[s.off_player_id]) || ZONE_SHORT[s.zone];
  // No more subs this quarter: the next would fall after the siren.
  const subsDoneThisPeriod = suggestions.length === 0 && (subPastHooter || periodClockDone);
  const inPlay = isLivePlay && !isPreGame;
  const injuredSet = new Set(injuredIds);
  const loanedSet = new Set(loanedIds);
  const lockedSet = new Set(lockedIds);

  // The rotation rule's minimum (AFL 50–75 %, How we play): who's at risk
  // of missing it by full time (plan default 5: not behind right now, so
  // nobody's flagged at the first bounce). "Needs 6′ more" under the kid,
  // "3 under 50%" in the info line, "% of game · min 50%" in the kid bar.
  const minPct = aflPlaybook?.minGameTimePct ?? 0;
  const minStates = inPlay
    ? aflMinTimeStates({
        minPct,
        playedMs: totalMsByPlayer,
        awayMs,
        elapsedMs: initialState.completedQuarterMs + displayNowMs,
        quarterMs,
        periodCount: ageGroup.periodCount,
        soonMs: subIntervalMs > 0 ? subIntervalMs : quarterMs,
        playerIds: [...ALL_ZONES.flatMap((z) => lineup[z]), ...lineup.bench],
        out: new Set([...injuredIds, ...loanedIds]),
      })
    : new Map<string, never>();
  const underCount = Array.from(minStates.values()).filter((m) => m.atRisk).length;

  function outOf(pid: string): { kind: KidOutKind; out: KidOut } | null {
    if (injuredSet.has(pid)) {
      const home = wentHomeSet.has(pid);
      return { kind: home ? "home" : "injured", out: { kind: "injured", wentHome: home } };
    }
    if (loanedSet.has(pid)) return { kind: "lent", out: { kind: "lent" } };
    return null;
  }

  // One kid, on the field or the bench (KidTile).
  function kidTile(pid: string, zone: Zone | null) {
    const p = playersById.get(pid);
    if (!p) return null;
    const out = outOf(pid);
    const pair = out ? null : pairOf.get(pid) ?? null;
    const sub: KidSubRole | null = pair ? (pair.role === "off" ? { role: "off" } : { role: "on", to: pairTo(pair.s) }) : null;
    const floor = out ? null : minStates.get(pid) ?? null;
    const words = kidWords({
      place: zone ? "field" : "bench",
      sub,
      subDue,
      needsMin: floor?.atRisk ? floor.neededMin : null,
      rollingSubs: true,
      subsDoneThisPeriod,
      out: out?.out ?? null,
      inPlay,
      lastPeriod: isLastPeriod,
    });
    const isSelected = selected?.playerId === pid;
    const score = playerScores[pid];
    const scored = !!score && (score.goals > 0 || score.behinds > 0);
    const lock = lockedSet.has(pid) ? "field" : zoneLockedPlayers[pid] ? "zone" : null;
    const totalMs = totalMsByPlayer[pid];
    const pos = zone ? positionLabels?.[pid] ?? null : null;
    return (
      <KidTile
        testId={`player-tile-${pid}`}
        name={names.tile(p)}
        spoken={{
          name: p.full_name,
          place: zone ? pos ?? ZONE_LABELS[zone] : null,
          number: p.jersey_number,
          time: totalMs !== undefined ? formatClock(totalMs) : null,
          states: [
            scored ? `${score.goals} goals, ${score.behinds} behinds` : null,
            !out && lock ? (lock === "field" ? "Field locked" : "Zone locked") : null,
            floor?.atRisk ? `under ${floor.minPct}% of the game` : null,
          ],
        }}
        place={zone ? "field" : "bench"}
        pos={pos}
        // Big fields: the dense tile ("CHB Jack S").
        dense={!!fitted && !!zone}
        // At risk of the minimum: the sun edge (its words say when, if
        // they're in the next sub).
        under={!!floor?.atRisk}
        score={scored ? { text: `${score.goals}.${score.behinds}`, label: "" } : null}
        words={words}
        badge={pair && inPlay ? { n: pair.i + 1, hot: subDue } : null}
        selected={isSelected}
        due={!!pair && inPlay && subDue}
        locked={!!lock}
        lockLabel={lock === "field" ? "Field locked" : lock === "zone" ? "Zone locked" : null}
        out={out?.kind ?? null}
        onClick={
          out
            ? // Hurt or lent: a tap opens their sheet (Mark recovered,
              // Bring back), as the old tiles' did.
              () => handleLongPress(pid)
            : zone
              ? () => handleTapField(pid, zone)
              : () => handleTapBench(pid)
        }
        onLongPress={() => handleLongPress(pid)}
      />
    );
  }

  // Big fields: the formation, line by line (Forward, Centre, Back),
  // each line its rows (formationRows), each spot its kid or an empty
  // position. Keyed by position, so a kid coming on rises into it. A
  // kid a line has no position for (more on it than its spots) goes in
  // a row after it.
  function bigFieldLines(): FieldLine[] {
    if (!bigField || !fitted) return [];
    return formationRows(bigField.positions).map((fl) => {
      const zone = fl.line as Zone;
      const rows = fl.rows.map((row) =>
        row.map((p) => {
          const pid = fitted.seats[p.key];
          return (
            <div key={p.key} className="min-w-0">
              {pid ? (
                kidTile(pid, zone)
              ) : (
                <KidSlot
                  label={`Empty ${p.label} spot`}
                  text={selected ? "Move here" : `${p.label} empty`}
                  hot={!!selected}
                  onClick={() => handleTapSeat(p.key, zone)}
                />
              )}
            </div>
          );
        }),
      );
      const spare = fitted.spare[zone] ?? [];
      if (spare.length > 0) {
        rows.push(
          spare.map((pid) => (
            <div key={`spare-${pid}`} className="min-w-0">
              {kidTile(pid, zone)}
            </div>
          )),
        );
      }
      return { key: zone, label: ZONE_LABELS[zone], tiles: rows.flat(), rows };
    });
  }

  // The field: a line per zone, attacking up the page (fwd first).
  const fieldLines: FieldLine[] = fitted ? bigFieldLines() : positionsFor(positionModel)
    .slice()
    .reverse()
    .flatMap((key) => {
      const ids = lineup[key];
      const cap = zoneCaps[key] ?? 0;
      const displayCap = displayZoneCaps[key] ?? cap;
      if (cap === 0 && displayCap === 0 && ids.length === 0) return [];
      const slots = Math.max(displayCap, ids.length);
      return [
        {
          key,
          label: ZONE_LABELS[key],
          // Keyed by spot, not kid: a sub hands the spot over and the new
          // name rises in.
          tiles: Array.from({ length: slots }, (_, slot) => {
            const pid = ids[slot];
            return (
              <div key={`slot-${slot}`} className="min-w-0">
                {pid ? (
                  kidTile(pid, key)
                ) : (
                  <KidSlot
                    label={`Empty ${ZONE_SHORT[key]} spot`}
                    text={selected ? "Move here" : "Empty"}
                    hot={!!selected}
                    onClick={() => handleTapField("", key)}
                  />
                )}
              </div>
            );
          }),
        },
      ];
    });
  const fieldEl = (
    <FieldLines
      lines={fieldLines}
      {...ovalField(!!fitted)}
      wakeUpKey={fieldWakeUpKey}
    />
  );

  // Squad kids not in the game yet: "+ Late" at the foot of the bench
  // (and in ⋯).
  const lateCandidates = !isFinished
    ? squadPlayers.filter((p) => !lineup.bench.includes(p.id) && !ALL_ZONES.some((z) => lineup[z].includes(p.id)))
    : [];
  // The bench: who can come on, then who's out (hurt, home, lent).
  const benchOrder = [
    ...lineup.bench.filter((id) => !injuredSet.has(id) && !loanedSet.has(id)),
    ...lineup.bench.filter((id) => injuredSet.has(id) || loanedSet.has(id)),
  ];
  const benchEl = (
    <KidBench
      count={lineup.bench.length}
      tiles={benchOrder.map((pid) => (
        <div key={pid} className="min-w-0">
          {kidTile(pid, null)}
        </div>
      ))}
      late={
        lateCandidates.length > 0 ? (
          <LateArrivalMenu look="text" candidates={lateCandidates} onAdd={handleLateArrival} pending={isPending} />
        ) : undefined
      }
    />
  );

  // ─── The planned sub: make, edit, revert ───────────────────
  // An edit pins the edited pairs (the Plan-Ahead planner's pin); when
  // the edit matches the engine's pick again the pin goes, and the live
  // suggester takes back over. Any F2 next-period plan on the same
  // slice is kept.
  function overridePairs(nextSwaps: typeof suggestions) {
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
  }
  function revertPair(i: number) {
    const auto = rawSuggestions[i];
    if (!auto) return;
    overridePairs(applyInlineSwapOverride(suggestions, i, { off: auto.off_player_id, on: auto.on_player_id }));
  }
  function makeAllPairs() {
    for (const s of suggestions) {
      persistSwap(s.off_player_id, s.on_player_id, s.zone);
    }
    // The strip's Undo puts them back, last first, without restarting
    // the sub clock again (undoSwaps).
    const pairs = suggestions.map((s) => ({ off: s.off_player_id, on: s.on_player_id, zone: s.zone }));
    const undo = undoSwaps(pairs, (s) => persistSwap(s.off, s.on, s.zone, false, 0, true));
    if (suggestions.length === 1) {
      const s = suggestions[0];
      showSwapToast(`${shortName(s.off_player_id)} → ${shortName(s.on_player_id)}`, undo, swapUndoLabel(pairs, shortName));
    } else if (suggestions.length > 1) {
      showSwapToast(`${suggestions.length} subs made`, undo, swapUndoLabel(pairs, shortName));
    }
    // The pinned plan-ahead sub (if any) has now been applied — consume
    // it so it can't re-fire next window. Planned periods stay.
    setPlannedRotation(withoutSubPin(pinForThisGame));
    setPairsOpen(false);
    clearSelection();
  }
  function makeOnePair(i: number) {
    // The only pair: the same as making them all.
    if (suggestions.length <= 1) return makeAllPairs();
    const s = suggestions[i];
    if (!s) return;
    // One of the batch, due or not yet: the rest stay planned until
    // they're made and the sub clock holds (soccer's rule). Made early,
    // one pair used to restart the clock and drop the rest (Stagehand,
    // 9 Nov 2026).
    persistSwap(s.off_player_id, s.on_player_id, s.zone, true, suggestions.length - 1);
    // Undo puts the kids back and the pair back in the plan: the swap
    // back reopens the whole batch, so the clock still holds (Stagehand
    // round 10: one pair couldn't be undone).
    const batch = suggestions.length;
    // The two kids' "just subbed" stamps from before the pair: put back
    // with it, so the kid back on the bench isn't kept off for a rest
    // (lib/live/swapRecency does the same for the replay).
    const kids = [s.off_player_id, s.on_player_id];
    const was = kids.map((id) => ({ id, on: localSubbedMs.on[id], off: localSubbedMs.off[id] }));
    showSwapToast(
      `${shortName(s.off_player_id)} → ${shortName(s.on_player_id)}`,
      () => {
        persistSwap(s.on_player_id, s.off_player_id, s.zone, true, batch, true);
        setLocalSubbedMs((prev) => {
          const on = { ...prev.on };
          const off = { ...prev.off };
          for (const w of was) {
            if (w.on === undefined) delete on[w.id];
            else on[w.id] = w.on;
            if (w.off === undefined) delete off[w.id];
            else off[w.id] = w.off;
          }
          return { on, off };
        });
      },
      swapUndoLabel([{ off: s.off_player_id, on: s.on_player_id }], shortName),
    );
    clearSelection();
  }
  function initials(full: string): string {
    const w = full.trim().split(/\s+/);
    return ((Array.from(w[0] ?? "")[0] ?? "") + (w.length > 1 ? Array.from(w[w.length - 1])[0] ?? "" : "")).toUpperCase();
  }
  const sheetPairs: SheetPair[] = suggestions.flatMap((s, i) => {
    const off = playersById.get(s.off_player_id);
    const on = playersById.get(s.on_player_id);
    if (!off || !on) return [];
    return [
      {
        index: i,
        offId: off.id,
        onId: on.id,
        offName: names.first(off),
        onName: names.first(on),
        offFull: off.full_name,
        onFull: on.full_name,
        where: positionLabels?.[off.id] ?? ZONE_SHORT[s.zone],
        edited: isPairEdited(s, rawSuggestions),
      },
    ];
  });
  const openPairs = () => {
    clearSelection();
    setPairsOpen(true);
  };

  // Plan Q{n+1} (F2 / ROTPLAN-02): offered once the rest of this period
  // won't churn the lineup (canPlanNextPeriod). It's in ⋯ too; here it's
  // the small chip at the end of the info line, as v3 draws it, or the
  // "Q3 ready ✓ Clear" badge once a plan's pinned.
  const planLabel = hasPinnedNextPeriod ? `Edit Q${currentQuarter + 1} plan` : `Plan Q${currentQuarter + 1}`;
  const planChip = showPlanNextPeriod ? (
    <PlanNextChip
      next={`Q${currentQuarter + 1}`}
      ready={hasPinnedNextPeriod}
      label={planLabel}
      onOpen={() => setPlanNextOpen(true)}
      onClear={() => setPlannedRotation(consumePeriodPin(pinForThisGame, currentQuarter))}
    />
  ) : null;

  // Ending the quarter: ⋯'s "End Q2" row, and "Time's up: end Q2" on
  // the info line once the clock reads 0:00 and the quarter's still
  // open. Both open the end confirm the clock sheet's row does.
  const canEndPeriod = isLivePlay && !isPreGame && !isFinished && !showQuarterEndModal;
  const periodTimeUp = canEndPeriod && quarterMs > 0 && nowMs >= quarterMs;
  const endWords = endPeriodWords({
    sport: "afl",
    periodLabel: "quarter",
    period: currentQuarter,
    periodCount: ageGroup.periodCount,
    timeUp: periodTimeUp,
  });
  const openEndPeriod = () => {
    clearSelection();
    setShowManualEndConfirm(true);
  };

  // The info line: the next sub (or that it's due), with the plan chip.
  // Shown in play when there's a bench to sub from, or a plan to make,
  // or the quarter's time is up.
  const infoEl =
    inPlay && (lineup.bench.length > 0 || planChip || periodTimeUp) ? (
      <InfoLine
        timeUp={periodTimeUp ? { prompt: endWords.prompt, onEnd: openEndPeriod } : undefined}
        state={subState}
        msUntilDue={subPastHooter ? null : msUntilDue}
        subIntervalMs={subIntervalMs}
        swaps={sheetPairs.length}
        carry={pastHooterCarry}
        under={minPct > 0 ? { count: underCount, minPct } : null}
        periodWord="quarter"
        noBench={lineup.bench.length > 0 && !hasSwappableBench}
        onOpen={sheetPairs.length > 0 ? openPairs : undefined}
        plan={planChip}
      />
    ) : null;

  // ─── The bar ───────────────────────────────────────────────
  // A picked kid: the bar is theirs (KidBar). The sub due: MAKE ALL N
  // SWAPS (hi-vis) and PAIRS. Otherwise the score bar, or (scoring off)
  // where things are.
  const kidBar =
    selected && !isPreGame && !isFinished
      ? (() => {
          const pid = selected.playerId;
          const p = playersById.get(pid);
          if (!p) return null;
          const zone = selected.kind === "field" ? selected.zone : null;
          const first = names.first(p);
          const pos = zone ? positionLabels?.[pid] ?? null : null;
          const totalMs = totalMsByPlayer[pid] ?? 0;
          const gameMs = initialState.completedQuarterMs + displayNowMs;
          const zm = zoneMsByPlayer[pid];
          const floor = minStates.get(pid);
          const lock = lockedSet.has(pid) ? "field" : zoneLockedPlayers[pid] ? "zone" : null;
          const pair = pairOf.get(pid) ?? null;
          const pairS = pair?.s ?? null;
          const btn = (tone: Parameters<typeof barButton>[0]) => barButton(tone, "sm");
          const actions = [
            ...(canScore
              ? [
                  <button key="goal" type="button" onClick={() => handleScore("goal")} disabled={isPending} className={btn("primary")}>
                    + Goal
                  </button>,
                  <button key="behind" type="button" onClick={() => handleScore("behind")} disabled={isPending} className={btn("outlined")}>
                    + Behind
                  </button>,
                ]
              : []),
            lock ? (
              <button
                key="unlock"
                type="button"
                onClick={() => {
                  setLocked(pid, false);
                  setZoneLocked(pid, null);
                  saveLock(pid, null);
                }}
                className={`${btn("oval")} col-span-2`}
              >
                Let them rotate again
                <span className={BAR_SMALL}>held {lock === "field" ? "on field" : `in ${zone ? ZONE_LABELS[zone] : "their line"}`}</span>
              </button>
            ) : (
              <button
                key="injured"
                type="button"
                disabled={isPending}
                onClick={() => {
                  clearSelection();
                  // On the field with someone to bring on: straight to who
                  // comes on. On the bench: marked at once.
                  if (zone && hasSwappableBench) {
                    setInjuryReplacementModal({ injuredId: pid, zone });
                    return;
                  }
                  handleInjuryToggle(pid, true);
                }}
                className={btn("hurt")}
              >
                <svg viewBox="0 0 20 20" className="h-[16px] w-[16px]" aria-hidden>
                  <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
                </svg>
                Injured
              </button>
            ),
            <KidBarMore
              key="more"
              onClick={() => {
                clearSelection();
                handleLongPress(pid);
              }}
            />,
          ];
          const columns = actions.length + (lock ? 1 : 0);
          return (
            <KidBar
              name={p.full_name}
              heading={`${p.jersey_number != null ? `#${p.jersey_number} ` : ""}${p.full_name}${pos ? ` · ${pos}` : ""}`}
              split={
                zm ? (
                  <TimeSplit
                    parts={[
                      { ms: zm.fwd + zm.hfwd, className: "bg-zone-f-fill" },
                      { ms: zm.mid, className: "bg-zone-c-fill" },
                      { ms: zm.back + zm.hback, className: "bg-zone-b-fill" },
                    ]}
                  />
                ) : null
              }
              line={`${zone ? ZONE_LABELS[zone] : "Bench"} · ${Math.round(totalMs / 60_000)}′ this game · ${
                floor && minPct > 0 ? minBarText(floor) : `${pctOfGame(totalMs, gameMs)}% of game`
              }`}
              hint={
                zone && fitted ? (
                  <>
                    Tap a kid on the field to trade positions with <b className="font-bold text-ink">{first}</b>, or on the bench to sub.
                  </>
                ) : zone ? (
                  <>
                    Tap another kid to swap with <b className="font-bold text-ink">{first}</b>.
                  </>
                ) : (
                  <>
                    Tap a field kid to swap <b className="font-bold text-ink">{first}</b> on.
                  </>
                )
              }
              pair={
                pair && pairS
                  ? {
                      n: pair.i + 1,
                      text: `${shortName(pairS.off_player_id)} → ${shortName(pairS.on_player_id)}`,
                      where: pairTo(pairS),
                      hot: subDue,
                      edited: isPairEdited(pairS, rawSuggestions),
                      onRevert: () => revertPair(pair.i),
                      onMake: () => makeOnePair(pair.i),
                      disabled: isPending,
                    }
                  : null
              }
              actions={actions}
              columns={columns}
              onClose={clearSelection}
            />
          );
        })()
      : null;

  // The sub's due: the bar's one job is to make it.
  const dueBar =
    subDue && sheetPairs.length > 0 ? (
      <div className="grid grid-cols-[minmax(0,1fr)_84px] gap-[8px]">
        <button
          type="button"
          data-testid="bar-make-all"
          onClick={() => {
            void hapticSuccess();
            makeAllPairs();
          }}
          disabled={isPending}
          aria-label={sheetPairs.length === 1 ? "Make this swap" : `Make all ${sheetPairs.length} swaps`}
          aria-describedby="bar-make-all-who"
          className={barButton("hot")}
        >
          {sheetPairs.length === 1 ? "Make this swap" : `Make all ${sheetPairs.length} swaps`}
          <span id="bar-make-all-who" className={`${BAR_SMALL} max-w-full truncate`}>
            {sheetPairs.map((sp) => sp.onName).join(", ")} on
          </span>
        </button>
        <button type="button" onClick={openPairs} aria-label="Pairs: edit one" className={barButton("outlined")}>
          Pairs
          <span className={BAR_SMALL}>edit one</span>
        </button>
      </div>
    ) : null;

  // The pre-kickoff bar: the first-visit tour offer, then Start Q1, the
  // same place every sport starts from. Hi-vis: it's the "act now".
  const preKickoffBar = (
    <div className="flex flex-col gap-[6px]">
      <AflWalkthroughOffer trackScoring={trackScoring} />
      <StartBarButton label="Start Q1" onClick={() => setStartQ1Open(true)} disabled={isPending} />
    </div>
  );
  const onFieldNow = ALL_ZONES.reduce((n, z) => n + lineup[z].length, 0);
  // Scoring off: nothing to score, so the bar just says where things are.
  const scoringOffBar = (
    <p className="flex min-h-[58px] items-center px-[2px] text-[0.8125rem] text-ink-mute">
      <span>
        <b className="block font-display stretch-75 text-[1.125rem] font-extrabold text-ink">{teamName}</b>
        Tap any kid for swaps and player actions.
      </span>
    </p>
  );
  const shellBar = isPreGame
    ? preKickoffBar
    : kidBar ??
      dueBar ??
      (trackScoring ? (
        <GameHeader
          part="bar"
          teamName={teamName}
          opponentName={opponentName}
          trackScoring={trackScoring}
          onTeam={(kind) => setPickScorerKind(kind)}
          onOpponent={handleOpponent}
          running={running}
          isPreGame={isPreGame}
          isFinished={isFinished}
          clockMultiplier={clockMultiplier}
          quarterMs={quarterMs}
          periodCount={ageGroup.periodCount}
          isPending={isPending}
        />
      ) : (
        scoringOffBar
      ));

  const shellHeader = (
    <GameHeader
      part="header"
      teamName={teamName}
      opponentName={opponentName}
      trackScoring={trackScoring}
      onClockTap={handleClockTap}
      running={running}
      isPreGame={isPreGame}
      isFinished={isFinished}
      clockMultiplier={clockMultiplier}
      quarterMs={quarterMs}
      periodCount={ageGroup.periodCount}
      isPending={isPending}
      clockPulseKey={clockPulseKey}
      subDue={subState === "due"}
      // Tap the score: Scores and fixes, for whoever's running the game.
      onScores={
        trackScoring && !isPreGame
          ? () => {
              clearSelection();
              setScoresOpen(true);
            }
          : undefined
      }
    />
  );

  const roundWord = game.round_number != null ? `Round ${game.round_number}` : null;
  // "AFL U16 Boys", not the id's "U16_boys".
  const ageWord = ageGroup.id.replace(/_(boys|girls)$/, (_m, g: string) => ` ${g[0].toUpperCase()}${g.slice(1)}`);
  const topSubline = isPreGame
    ? [roundWord, game.location].filter(Boolean).join(" · ") || `${getSportConfig("afl").shortName} ${ageWord}`
    : [roundWord, `${getSportConfig("afl").shortName} ${ageWord}`].filter(Boolean).join(" · ");
  const whoRuns = auth.kind === "token" ? "Game-day link" : isAdmin ? "Team admin" : "Game manager";

  return (
    <div className="ui-nonselect space-y-4">
      {isFinished ? (
        <>
          {/* Full time and the finished game keep their page: the
              review, then the summary. */}
          {exitHref ? <LiveTopBar exitHref={exitHref} game={game} isLive onHelp={handleOpenWalkthrough} /> : null}
          {gameHeader}
          {isAtFullTime && (
            <FullTimeReview
              auth={auth}
              gameId={gameId}
              trackScoring={trackScoring}
              players={squadPlayers}
              finalisedElapsedMs={accumulatedMs}
            />
          )}
          {error && (
            <p className="rounded-sm bg-warn-soft px-3 py-2 text-sm text-warn-ink" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <LiveShell
          top={
            <LiveTopBar
              exitHref={exitHref ?? "/"}
              game={game}
              isLive={!isPreGame}
              onMenu={() => {
                // One sheet at a time: the kid is put down.
                clearSelection();
                setMenuOpen(true);
              }}
              subline={topSubline}
              periods={{ count: ageGroup.periodCount, seconds: quarterMs / 1000 }}
              // Sub due is said once, by the info line (its alert), the
              // kids' words and the bar: no banner over the top.
            />
          }
          banners={
            error ? (
              <p className="rounded-[12px] bg-blood-soft px-3 py-2 text-[0.8125rem] font-bold text-blood" role="alert">
                {error}
              </p>
            ) : null
          }
          header={shellHeader}
          undo={oneUndo.strip({ show: !isPreGame, plain: true, onScore: handleUndo, disabled: isPending })}
          info={infoEl}
          field={fieldEl}
          bench={benchEl}
          bar={shellBar}
          toast={
            swapToast ? (
              <SwapDoneToast look="ink" text={swapToast} durationMs={2500} />
            ) : null
          }
        />
      )}

      {/* ⋯: late arrival, settings, scores, the plan, the tour, feedback,
          the game-day link, Restart and (before kickoff) Edit lineup. */}
      <LiveGameMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        auth={auth}
        gameId={gameId}
        game={game}
        isAdmin={isAdmin}
        subline={[roundWord, whoRuns].filter(Boolean).join(" · ")}
        finished={finalised}
        lateCandidates={lateCandidates}
        onLateArrival={handleLateArrival}
        latePending={isPending}
        settings={{
          summary: settingsSummary(subIntervalSeconds, currentOnFieldSize),
          subIntervalSeconds,
          currentOnFieldSize,
          minOnFieldSize,
          maxOnFieldSize,
          playersById,
        }}
        trackScoring={trackScoring}
        onScores={!isPreGame ? () => setScoresOpen(true) : undefined}
        planNext={showPlanNextPeriod ? { label: planLabel, onOpen: () => setPlanNextOpen(true) } : undefined}
        endPeriod={canEndPeriod ? { label: endWords.label, description: endWords.description, onSelect: openEndPeriod } : undefined}
        onWalkthrough={handleOpenWalkthrough}
        onEditLineup={isPreGame && !isFinished ? handleEditLineup : undefined}
      />

      {/* Scores and fixes: the Q-by-Q table (the store's numbers, so
          it's there before the log loads), then the fix list. */}
      {scoresOpen && (
        <ScoresSheet
          auth={auth}
          gameId={gameId}
          quarters={{
            sport: "afl",
            scoreByQuarter,
            currentQuarter,
            quarterEnded,
            teamName,
            opponentName,
            totalQuarters: ageGroup.periodCount,
          }}
          onClose={() => setScoresOpen(false)}
        />
      )}

      {/* Start Q1's confirm: "Start Q1 now" when the siren goes. Back
          leaves the lineup on screen; ⋯ → Edit lineup reopens the picker. */}
      {startQ1Open && isPreGame && (
        <StartQuarterModal
          quarter={1}
          cue={getSportConfig("afl").words.startCue}
          shortSide={{ playing: onFieldNow, size: defaultOnFieldSize, min: minOnFieldSize }}
          loading={isPending}
          onStart={handleStartFirstQuarter}
          onCancel={() => setStartQ1Open(false)}
        />
      )}

      {fillZone && (
        <SlotFillSheet
          slotLabel={fillSeat ? seatLabel(fillSeat) : ZONE_LABELS[fillZone]}
          candidates={lineup.bench
            .filter((id) => !injuredIds.includes(id) && !loanedIds.includes(id))
            .map((id) => playersById.get(id))
            .filter((p): p is Player => !!p)
            .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage="Nobody on the bench can come on."
          onPick={(pid) => {
            const zone = fillZone;
            const seat = fillSeat;
            setFillZone(null);
            setFillSeat(null);
            // A deliberate pick, off the sub cadence (as a tap-tap sub).
            manualSwap("", pid, zone, seat);
          }}
          onCancel={() => {
            setFillZone(null);
            setFillSeat(null);
          }}
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
          the other confirms so the visual language stays consistent. */}
      {clockMenuOpen && (
        <ClockMenu
          sport="afl"
          periodAbbr={`Q${currentQuarter}`}
          running={running}
          onPause={handlePause}
          onResume={handleResume}
          onEndEarly={
            !isPreGame && !isFinished ? () => setShowManualEndConfirm(true) : undefined
          }
          onClose={() => setClockMenuOpen(false)}
          // The v3 clock sheet: "Running · 7:40 left".
          remaining={formatClock(Math.max(0, quarterMs - displayNowMs))}
        />
      )}

      {showManualEndConfirm && (
        <ManualEndQuarterConfirm
          quarter={currentQuarter}
          sport="afl"
          clock={running ? "running" : "paused"}
          elapsedMs={displayNowMs}
          periodMs={quarterMs}
          onConfirm={(full) => {
            setShowManualEndConfirm(false);
            // The time played, or (the game played on while the app's
            // clock sat paused) the whole period: the coach's choice. It
            // used to be the whole period, silently (round 3, 24 Oct 2026).
            handleEndQuarter({ creditFullQuarter: full });
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
            wentHome={wentHomeSet.has(lockModal.playerId)}
            onWentHome={() => {
              // As an injury: an on-field kid asks who comes on.
              const onFieldZone = ALL_ZONES.find((z) => lineup[z].includes(lockModal.playerId));
              if (onFieldZone && lineup.bench.some((id) => !injuredIds.includes(id) && !loanedIds.includes(id))) {
                setInjuryReplacementModal({ injuredId: lockModal.playerId, zone: onFieldZone, reason: "went_home" });
                setLockModal(null);
                return;
              }
              handleInjuryToggle(lockModal.playerId, true, true);
              setLockModal(null);
            }}
            onToggleLoan={() => {
              // Lending a kid off the field asks who comes on, as an injury
              // does; it left the spot empty with no word (Stagehand round 7).
              // Nobody on the bench: the sheet still opens and says so, and
              // the coach lends them to play one short (Stagehand round 9).
              const onFieldZone = !isLoaned && ALL_ZONES.find((z) => lineup[z].includes(lockModal.playerId));
              if (onFieldZone) {
                setInjuryReplacementModal({ injuredId: lockModal.playerId, zone: onFieldZone, reason: "lent" });
                setLockModal(null);
                return;
              }
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
              // manualSwap (an instant sub, with Undo).
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
            reason={injuryReplacementModal.reason ?? "injured"}
            spotLabel={ZONE_SHORT_LABELS[injuryReplacementModal.zone]}
            candidates={candidates}
            onPickReplacement={(rid) => {
              const { injuredId, zone, reason } = injuryReplacementModal;
              if (reason === "lent") {
                // Lent, then the pick fills the spot (as tapping it would),
                // into the lent kid's position on a big field.
                const before = seatsNow();
                const seat = before ? seatOf(before, injuredId) : null;
                handleLoanToggle(injuredId, true);
                persistSwap("", rid, zone, false, 0, false, seat);
                showSwapToast(`${shortName(rid)} on`);
              } else {
                handleInjuryReplacement(injuredId, rid, zone, reason === "went_home");
              }
              setInjuryReplacementModal(null);
            }}
            onSkipReplacement={() => {
              const { injuredId, reason } = injuryReplacementModal;
              if (reason === "lent") handleLoanToggle(injuredId, true);
              else handleInjuryToggle(injuredId, true, reason === "went_home");
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
            lostScore={slotLabel.toLowerCase()}
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

      {/* The pairs (live v3): the planned sub, pair by pair, from the
          info line or the due bar's PAIRS. Edit a side, revert an edit,
          make one, or make them all. */}
      {pairsOpen && !isPreGame && !isFinished && sheetPairs.length > 0 && (
        <PairsSheet
          pairs={sheetPairs}
          due={subDue}
          msUntilDue={subPastHooter ? null : msUntilDue}
          carry={pastHooterCarry}
          periodWord="Quarter"
          options={(i, side) => {
            const input = { swaps: suggestions, pairIndex: i, lineup, injuredIds, loanedIds, lockedIds };
            return (side === "on" ? eligibleOnReplacements(input) : eligibleOffReplacements(input)).flatMap((id) => {
              const p = playersById.get(id);
              return p ? [{ id, name: names.first(p), initials: initials(p.full_name) }] : [];
            });
          }}
          offHeading={(i) => `Take off instead (${suggestions[i] ? ZONE_LABELS[suggestions[i].zone] : "the line"})`}
          onPick={(i, side, id) => {
            const cur = suggestions[i];
            if (!cur) return;
            if ((side === "on" ? cur.on_player_id : cur.off_player_id) === id) return;
            overridePairs(applyInlineSwapOverride(suggestions, i, { [side]: id }));
          }}
          onRevert={revertPair}
          onMakeOne={makeOnePair}
          onMakeAll={makeAllPairs}
          pending={isPending}
          onClose={() => setPairsOpen(false)}
        />
      )}

      {/* Full-time game summary — renders only AFTER the coach has
          tapped "Finalise game" in the FullTimeReview panel above.
          Until then `finalised` is false and the review takes the
          place of the summary. */}
      {finalised && (
        <GameSummaryCard
          wentHomeIds={wentHomeSet}
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
      {/* The game-day link's "All done" is the page's shared
          RunnerAllDone, as every other sport's; a second copy here sat
          fixed under it (design review, Oct 2026). */}

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
