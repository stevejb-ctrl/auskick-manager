"use client";

// ─── Basketball's break ──────────────────────────────────────
// Basketball's break plan (suggestBasketballBreakPlan), its writers and
// who can play (fouled out, sitting out, injured, lent), adapted onto
// the one break screen every sport shares (quarter-break/PeriodBreak):
// Forwards / Guards (or one Court zone under Equal minutes) / Bench,
// "2nd half" or "Q3" words. The plan is staged in the shared break
// draft (with each kid's position, under the position strategies) and
// Start commits it as one lineup_set before the period. The layout
// lives in PeriodBreak.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sidelinedLabel } from "@/lib/live/wentHome";
import { useRouter } from "next/navigation";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { liveEvents } from "@/lib/live/optimisticEvents";
import type { OptimisticWrite } from "@/lib/live/useOptimisticEvents";
import { queuedStartClockMark } from "@/lib/live/useClockPause";
import { useStagedBreakDraft } from "@/lib/live/useStagedBreakDraft";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { hapticTap } from "@/lib/haptics";
import { type InjuryReplacementCandidate } from "@/components/live/InjuryReplacementModal";
import { PeriodBreak, type BreakPlayer, type BreakStrategy } from "@/components/quarter-break/PeriodBreak";
import { breakConfigFor } from "@/lib/sports/break";
import { buildBoard, placesOf, type BoardSlot, type StagedLineup } from "@/lib/live/break/board";
import { breakIssues } from "@/lib/live/break/issues";
import { useBreakReplan } from "@/lib/live/break/useBreakReplan";
import { awayMsSoFar } from "@/lib/live/break/floor";
import { rotateGroups } from "@/lib/live/break/rotateGroups";
import { BASKETBALL_POSITION_DEFS } from "@/lib/sports/basketball";
import { basketballBreakCheck } from "@/lib/sports/basketball/breakCheck";
import {
  basketballLineOf,
  basketballOnCourt,
  normalizeBasketballLineup,
  type BasketballLineup,
} from "@/lib/sports/basketball/lineup";
import { basketballCanPlay, basketballGameMs, type BasketballGameState } from "@/lib/sports/basketball/replay";
import {
  basketballShapeFor,
  suggestBasketballBreakPlan,
  type BasketballPrefs,
  type BasketballSeasonBalance,
} from "@/lib/sports/basketball/suggest";
import { benchOutInBasketballLineup, placeInBasketballLineup, swapInBasketballLineup } from "@/lib/sports/basketball/live";
import type { BasketballAgeGroupConfig, BasketballLine, BasketballStrategy } from "@/lib/sports/basketball/types";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";

const GROUPS = ["forward", "guard", "court"] as const;
const POSITION_TAG = Object.fromEntries(BASKETBALL_POSITION_DEFS.map((p) => [p.key, p.label])) as Record<string, string>;

/** The shared staged lineup, with each kid's position (the position strategies) beside it. */
type Staged = StagedLineup & { slots?: Record<string, string> };

function stagedOf(l: BasketballLineup): Staged {
  return {
    groups: { forward: l.lines.forward, guard: l.lines.guard, court: l.lines.court },
    bench: l.bench,
    ...(l.slots ? { slots: l.slots } : {}),
  };
}
function lineupOf(s: Staged): BasketballLineup {
  // Normalised: a restored draft comes back from storage.
  return normalizeBasketballLineup({ lines: s.groups, bench: s.bench, slots: s.slots });
}

/** Basketball's own swap (positions travel with the kids); one into an empty spot. */
function swapSlots(l: BasketballLineup, a: BoardSlot, b: BoardSlot): BasketballLineup {
  if (a.playerId && b.playerId) return swapInBasketballLineup(l, a.playerId, b.playerId);
  const [kid, spot] = a.playerId ? [a.playerId, b] : [b.playerId as string, a];
  if (spot.zone === "bench") return l;
  return placeInBasketballLineup(l, kid, spot.zone as BasketballLine);
}

interface Props {
  auth: LiveAuth;
  /** The live screen's optimistic write: Start shows at once, with or without signal. */
  write: OptimisticWrite;
  game: Game;
  exitHref?: string;
  squad: Player[];
  ageGroup: BasketballAgeGroupConfig;
  /** The game at the break (no open stints). */
  state: BasketballGameState;
  /** The game's events: who arrived late, was hurt or lent, and when. */
  events: GameEvent[];
  periodMs: number;
  strategy: BasketballStrategy;
  prefs?: BasketballPrefs;
  season?: BasketballSeasonBalance;
  trackFouls: boolean;
  /** The shape the last lineup played ("2-3"), if lines. */
  shapeId: string | null;
  /** The score chip: points each side, and the editor it opens. */
  score?: { us: number; them: number; editor: ReactNode };
}

export function BasketballBreak({
  auth,
  write,
  game,
  exitHref,
  squad,
  ageGroup,
  state,
  events,
  periodMs,
  strategy: playStrategy,
  prefs,
  season,
  trackFouls,
  shapeId,
  score,
}: Props) {
  const router = useRouter();
  const nextPeriod = state.currentPeriod + 1;
  const startMs = state.completedPeriodMs;
  const playerById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const previousLineup = state.lineup;
  const inGame = useMemo(
    () => (previousLineup ? [...basketballOnCourt(previousLineup), ...previousLineup.bench] : []),
    [previousLineup],
  );
  // Who can't start the next period, and why.
  const sidelined = useMemo(() => {
    const out: Record<string, string> = {};
    const injured = new Set(state.injuredIds);
    const loaned = new Set(state.loanedIds);
    const fouled = new Set(state.fouledOutIds);
    const home = new Set(state.wentHomeIds);
    for (const id of inGame) {
      // A kid who fouls out is recorded as injured (reason "fouled_out").
      if (fouled.has(id)) out[id] = "Fouled out";
      else if (injured.has(id)) out[id] = sidelinedLabel(id, home);
      else if (loaned.has(id)) out[id] = "Lent";
      else if (!basketballCanPlay(state, id, startMs)) out[id] = "Sitting out";
    }
    return out;
  }, [inGame, state, startMs]);
  const sidelinedSet = useMemo(() => new Set(Object.keys(sidelined)), [sidelined]);
  const healthy = useMemo(() => inGame.filter((id) => !sidelinedSet.has(id)), [inGame, sidelinedSet]);
  const sidelinedInGame = useMemo(() => inGame.filter((id) => sidelinedSet.has(id)), [inGame, sidelinedSet]);
  const gameMs = useMemo(() => Object.fromEntries(squad.map((p) => [p.id, basketballGameMs(state, p.id)])), [squad, state]);

  // ── Strategies ─────────────────────────────────────────────
  const plan = useMemo(
    () => suggestBasketballBreakPlan({ state, onCourtSize: game.on_field_size, strategy: playStrategy, shapeId, prefs, season }),
    [state, game.on_field_size, playStrategy, shapeId, prefs, season],
  );
  const shape = useMemo(
    () => plan?.shape ?? basketballShapeFor(playStrategy, Math.min(game.on_field_size, healthy.length), shapeId),
    [plan, playStrategy, game.on_field_size, healthy.length, shapeId],
  );
  const repeat = useMemo(
    () =>
      previousLineup
        ? benchOutInBasketballLineup(previousLineup, sidelinedSet)
        : { lines: { guard: [], forward: [], court: [] }, bench: [...healthy] },
    [previousLineup, sidelinedSet, healthy],
  );
  const suggested = plan?.lineup ?? repeat;
  const manual = useMemo<BasketballLineup>(
    () => ({ lines: { guard: [], forward: [], court: [] }, bench: [...healthy, ...sidelinedInGame] }),
    [healthy, sidelinedInGame],
  );
  // Rotate: guards and forwards trade lines (the shape kept), the
  // least-played on; under Equal minutes, just the least-played on.
  const rotated = useMemo<BasketballLineup>(() => {
    const out = rotateGroups({
      players: healthy,
      cycle: shape.lines.court > 0 ? ["court"] : ["guard", "forward"],
      caps: shape.lines,
      timeIn: (pid, g) => state.ms[pid]?.[g as BasketballLine] ?? 0,
      total: (pid) => gameMs[pid] ?? 0,
      lastGroup: Object.fromEntries(healthy.map((pid) => [pid, previousLineup ? basketballLineOf(previousLineup, pid) ?? undefined : undefined])),
      sidelinedIds: sidelinedInGame,
    });
    return lineupOf(out);
  }, [healthy, shape, state.ms, gameMs, previousLineup, sidelinedInGame]);

  // ── The staged plan ─────────────────────────────────────────
  const persistedRotationMode = useLiveGame((s) => s.rotationMode);
  const setPersistedRotationMode = useLiveGame((s) => s.setRotationMode);
  const initialMode: BreakStrategy =
    persistedRotationMode === "manual" ? "manual" : persistedRotationMode === "rotate" ? "rotate" : "suggested";
  const [strategy, setStrategy] = useState<BreakStrategy>(initialMode);
  const forStrategy = (s: BreakStrategy) =>
    s === "suggested" ? suggested : s === "rotate" ? rotated : s === "repeat" ? repeat : manual;
  const [draft, setDraft] = useState<BasketballLineup>(() => forStrategy(initialMode));
  const lastApplied = useRef<BreakStrategy>(initialMode);
  // A kid back at the break gets the strategy's lineup again, unless the
  // coach has placed kids by hand (lib/live/break/useBreakReplan).
  const replan = useBreakReplan(healthy, () => setDraft(forStrategy(strategy)));
  useEffect(() => {
    if (lastApplied.current === strategy) return;
    lastApplied.current = strategy;
    replan.strategyApplied();
    setDraft(forStrategy(strategy));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy]);

  const staged = useMemo(() => stagedOf(draft), [draft]);
  const stagedBreakDraft = useStagedBreakDraft({
    gameId: game.id,
    period: nextPeriod,
    ready: inGame.length > 0,
    groupIds: GROUPS,
    availableIds: healthy,
    benchOnlyIds: sidelinedInGame,
    staged,
    mode: strategy,
    onRestore: (restored) => {
      replan.placedByHand();
      setDraft(lineupOf(restored));
      const mode = restored.mode as BreakStrategy;
      if (["suggested", "rotate", "repeat", "manual"].includes(mode)) {
        lastApplied.current = mode;
        setStrategy(mode);
      }
    },
  });

  // ── Writers ─────────────────────────────────────────────────
  const at = { quarter: nextPeriod, elapsed_ms: 0 };
  async function run(p: Promise<unknown>) {
    setError(null);
    try {
      await p;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    }
    router.refresh();
  }
  function setInjured(pid: string, injured: boolean) {
    if (injured) setDraft((d) => benchOutInBasketballLineup(d, new Set([pid])));
    void run(enqueueLiveAction("markInjury", [auth, game.id, { player_id: pid, injured, ...at }]).flushed);
  }
  function setLent(pid: string, loaned: boolean) {
    if (loaned) setDraft((d) => benchOutInBasketballLineup(d, new Set([pid])));
    else setDraft((d) => (d.bench.includes(pid) || basketballLineOf(d, pid) ? d : { ...d, bench: [...d.bench, pid] }));
    void run(enqueueLiveAction("markLoan", [auth, game.id, { player_id: pid, loaned, ...at }]).flushed);
  }
  function addArrived(pid: string) {
    setDraft((d) => (d.bench.includes(pid) ? d : { ...d, bench: [...d.bench, pid] }));
    void run(enqueueLiveAction("addLateArrival", [auth, game.id, { player_id: pid, ...at }]).flushed);
  }
  function markOut(pid: string, replacementId: string | null) {
    if (replacementId) replan.placedByHand();
    setDraft((d) => {
      const line = basketballLineOf(d, pid);
      const benched = benchOutInBasketballLineup(d, new Set([pid]));
      return replacementId && line ? placeInBasketballLineup(benched, replacementId, line) : benched;
    });
    void run(enqueueLiveAction("markInjury", [auth, game.id, { player_id: pid, injured: true, ...at, reason: "out" }]).flushed);
  }

  // Start: the break's lineup, then the period, as optimistic writes
  // through the live screen's `write`, so the period starts at the tap
  // with or without signal (it used to wait on both saves; with no
  // signal it never started). With no signal the clock's start rides
  // along too (queuedStartClockMark).
  function start() {
    setError(null);
    // Kids who can't play now start on the bench, places left empty.
    const lineup = benchOutInBasketballLineup(draft, sidelinedSet);
    const mark = queuedStartClockMark(nextPeriod);
    write("recordBasketballLineupSet", [auth, game.id, lineup, undefined], liveEvents.breakLineup(lineup));
    write("startBasketballPeriod", [auth, game.id, nextPeriod], liveEvents.periodStart(nextPeriod));
    if (mark) write("recordClockPause", [auth, game.id, mark], liveEvents.clockPause(mark));
    stagedBreakDraft.clear();
    void hapticTap("medium");
  }

  // ── The break screen ────────────────────────────────────────
  const shapeNow = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = { ...shape.lines };
    for (const l of GROUPS) out[l] = Math.max(out[l] ?? 0, draft.lines[l].length);
    return out;
  }, [shape, draft]);
  const config = useMemo(
    () => breakConfigFor("basketball", ageGroup, { onFieldSize: game.on_field_size, shape: shapeNow }),
    [ageGroup, game.on_field_size, shapeNow],
  );
  const withOut = (l: BasketballLineup): StagedLineup => {
    const s = stagedOf(l);
    const onBoard = new Set([...Object.values(s.groups).flat(), ...s.bench]);
    return { groups: s.groups, bench: [...s.bench, ...sidelinedInGame.filter((id) => !onBoard.has(id))] };
  };
  const board = useMemo(() => buildBoard(config.zones, withOut(draft), sidelinedSet), [config.zones, draft, sidelinedSet]); // eslint-disable-line react-hooks/exhaustive-deps
  const previous = useMemo(() => (previousLineup ? placesOf(stagedOf(previousLineup)) : {}), [previousLineup]);

  const names = useMemo(() => Object.fromEntries(squad.map((p) => [p.id, p.full_name])), [squad]);
  // Time a kid couldn't play (late, hurt, lent) is off their game.
  const awayMs = useMemo(() => awayMsSoFar(events, () => periodMs, state.currentPeriod), [events, periodMs, state.currentPeriod]);
  const issues = useMemo(() => {
    // Basketball's engine acts on no catalogue rule yet: the check is the
    // 50% game-time floor (basketball/breakCheck).
    const check = (l: BasketballLineup) =>
      basketballBreakCheck({
        lineup: l,
        state,
        sidelined: sidelinedSet,
        court: shape.lines.court > 0,
        period: nextPeriod,
        periodCount: ageGroup.periodCount,
        periodMs,
        names,
        awayMs,
      });
    return breakIssues({
      lineup: draft,
      check,
      board: (l) => buildBoard(config.zones, withOut(l), sidelinedSet),
      swap: swapSlots,
      sidelined: sidelinedSet,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, sidelinedSet, state, shape, names, nextPeriod, ageGroup.periodCount, periodMs, awayMs, config.zones]);

  const asBreakPlayer = (p: Player): BreakPlayer => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number });
  const players = useMemo(() => new Map(squad.map((p) => [p.id, asBreakPlayer(p)])), [squad]);
  const scores = useMemo(() => {
    const out: Record<string, { text: string; label: string }> = {};
    for (const [pid, n] of Object.entries(state.playerPoints)) if (n > 0) out[pid] = { text: String(n), label: `${n} points` };
    return out;
  }, [state.playerPoints]);
  // Tags: a kid's position (under the position strategies) and fouls.
  const tags = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const [pid, pos] of Object.entries(draft.slots ?? {})) if (POSITION_TAG[pos]) out[pid] = [POSITION_TAG[pos]];
    if (trackFouls) {
      for (const [pid, n] of Object.entries(state.fouls)) if (n > 0) out[pid] = [...(out[pid] ?? []), `${n}F`];
    }
    return out;
  }, [draft.slots, trackFouls, state.fouls]);
  const placed = new Set(inGame);
  const injuredSet = new Set(state.injuredIds);
  const loanedSet = new Set(state.loanedIds);
  const canPlay = squad.filter((p) => !sidelinedSet.has(p.id));
  const onCourtNow = basketballOnCourt(draft).filter((id) => !sidelinedSet.has(id));
  const benchNow = draft.bench.filter((id) => !sidelinedSet.has(id));

  return (
    <PeriodBreak
      header={{ exitHref, game }}
      config={config}
      nextPeriod={nextPeriod}
      slots={board}
      players={players}
      previous={previous}
      gameMs={gameMs}
      scores={scores}
      tags={tags}
      sidelined={sidelined}
      onSwap={(a, b) => {
        replan.placedByHand();
        setDraft((d) => swapSlots(d, a, b));
      }}
      strategy={strategy}
      onStrategy={(next) => {
        setStrategy(next);
        if (next !== "repeat") setPersistedRotationMode(next === "rotate" ? "rotate" : next === "manual" ? "manual" : "suggested");
      }}
      issues={issues}
      score={score ? { line: config.formatScore({ us: {}, them: {}, points: { us: score.us, them: score.them } }), editor: score.editor } : undefined}
      settings={{
        injured: {
          // Fouled out is for the game: not something to mark fit.
          players: squad.filter((p) => injuredSet.has(p.id) && !state.fouledOutIds.includes(p.id)).map(asBreakPlayer),
          candidates: canPlay.map(asBreakPlayer),
          onToggle: setInjured,
        },
        lent: {
          players: squad.filter((p) => loanedSet.has(p.id) && !injuredSet.has(p.id)).map(asBreakPlayer),
          candidates: canPlay.map(asBreakPlayer),
          onToggle: setLent,
        },
        arrived: { candidates: squad.filter((p) => !placed.has(p.id)).map(asBreakPlayer), onAdd: addArrived },
        markOut: {
          candidates: onCourtNow.map((id) => playerById.get(id)).filter((p): p is Player => !!p).map(asBreakPlayer),
          replacements: benchNow
            .map((id) => playerById.get(id))
            .filter((p): p is Player => !!p)
            .map<InjuryReplacementCandidate>((p) => ({ player: p, totalMs: gameMs[p.id] ?? 0 }))
            .sort((a, b) => a.totalMs - b.totalMs),
          spotLabel: (pid) => {
            const line = basketballLineOf(draft, pid);
            return line ? config.zones.find((z) => z.key === line)?.short ?? null : null;
          },
          player: (pid) => playerById.get(pid),
          onOut: markOut,
        },
        pending,
        error,
      }}
      start={{ onStart: start, pending, cue: "whistle goes", error }}
    />
  );
}
