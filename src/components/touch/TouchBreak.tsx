"use client";

// ─── Touch and Oztag half-time ───────────────────────────────
// The touch family's break plan (suggestTouchBreakPlan: who plays the
// next half, and in which lane), its writers and its mixed rule, adapted
// onto the one break screen every sport shares (quarter-break/
// PeriodBreak): Middles / Links / Wings (or one Field under Minutes
// only) / Bench, "2nd half" words. A mixed team's side is the size its
// rule allows, and a plan that breaks the rule (too many boys, too few
// girls) shows as a broken rule; who counts as a girl or a boy is never
// drawn on a tile. The plan is staged in the shared break draft (so it
// survives a reload or the app being backgrounded) and Start commits it
// as one lineup_set before the half. The layout lives in PeriodBreak.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { useStagedBreakDraft } from "@/lib/live/useStagedBreakDraft";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { hapticTap } from "@/lib/haptics";
import { type InjuryReplacementCandidate } from "@/components/live/InjuryReplacementModal";
import { PeriodBreak, type BreakPlayer, type BreakStrategy } from "@/components/quarter-break/PeriodBreak";
import { breakConfigFor } from "@/lib/sports/break";
import type { RuleCheckItem } from "@/lib/playbook/ruleCheck";
import { checkRules } from "@/lib/playbook/ruleCheck";
import { buildBoard, placesOf, type BoardSlot, type StagedLineup } from "@/lib/live/break/board";
import { breakIssues } from "@/lib/live/break/issues";
import { rotateGroups } from "@/lib/live/break/rotateGroups";
import { normalizeTouchLineup, touchLineOf, touchOnField, validateTouchLineup, type TouchLineup } from "@/lib/sports/touch/lineup";
import { touchCanPlay, touchGameMs, type TouchGameState } from "@/lib/sports/touch/replay";
import {
  suggestTouchBreakPlan,
  touchFieldPlan,
  touchShapeFor,
  type TouchMixed,
  type TouchPrefs,
  type TouchSeasonBalance,
} from "@/lib/sports/touch/suggest";
import { benchOutInTouchLineup, placeInTouchLineup, swapInTouchLineup } from "@/lib/sports/touch/live";
import { mixedRuleSummary } from "@/lib/sports/touch/mixed";
import { TOUCH_LANES, type TouchAgeGroupConfig, type TouchLine, type TouchStrategy } from "@/lib/sports/touch/types";
import type { Game, LiveAuth, Player } from "@/lib/types";
import type { SportId } from "@/lib/sports/types";

const GROUPS = ["middle", "link", "wing", "field"] as const;
const LINE_LABEL: Record<string, string> = { middle: "Middles", link: "Links", wing: "Wings", field: "Field" };

function stagedOf(l: TouchLineup): StagedLineup {
  return { groups: { middle: l.lines.middle, link: l.lines.link, wing: l.lines.wing, field: l.lines.field }, bench: l.bench };
}
function lineupOf(s: StagedLineup): TouchLineup {
  // Normalised: a restored draft comes back from storage.
  return normalizeTouchLineup({ lines: s.groups, bench: s.bench });
}

/** Touch's own swap: kids trade places; one into an empty spot. */
function swapSlots(l: TouchLineup, a: BoardSlot, b: BoardSlot): TouchLineup {
  if (a.playerId && b.playerId) return swapInTouchLineup(l, a.playerId, b.playerId);
  const [kid, spot] = a.playerId ? [a.playerId, b] : [b.playerId as string, a];
  if (spot.zone === "bench") return l;
  return placeInTouchLineup(l, kid, spot.zone as TouchLine);
}

interface Props {
  auth: LiveAuth;
  /** Touch or Oztag: its words come from its config. */
  sport: SportId;
  game: Game;
  exitHref?: string;
  squad: Player[];
  ageGroup: TouchAgeGroupConfig;
  /** The game at the break (no open stints). */
  state: TouchGameState;
  periodMs: number;
  strategy: TouchStrategy;
  prefs?: TouchPrefs;
  season?: TouchSeasonBalance;
  /** A mixed team's rule and who counts as what; undefined when it isn't mixed. */
  mixed?: TouchMixed;
  /** The lane shape the last lineup played ("2-2-2"), if lanes. */
  shapeId: string | null;
  /** The score chip: points each side, and the editor it opens. */
  score?: { us: number; them: number; editor: ReactNode };
}

export function TouchBreak({
  auth,
  sport,
  game,
  exitHref,
  squad,
  ageGroup,
  state,
  periodMs,
  strategy: playStrategy,
  prefs,
  season,
  mixed,
  shapeId,
  score,
}: Props) {
  const router = useRouter();
  const nextPeriod = state.currentPeriod + 1;
  const playerById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const previousLineup = state.lineup;
  const inGame = useMemo(
    () => (previousLineup ? [...touchOnField(previousLineup), ...previousLineup.bench] : []),
    [previousLineup],
  );
  const injuredSet = useMemo(() => new Set(state.injuredIds), [state.injuredIds]);
  const loanedSet = useMemo(() => new Set(state.loanedIds), [state.loanedIds]);
  // Who can't start the next half, and why.
  const sidelined = useMemo(() => {
    const out: Record<string, string> = {};
    for (const id of inGame) {
      if (injuredSet.has(id)) out[id] = "Injured";
      else if (loanedSet.has(id)) out[id] = "Lent";
    }
    return out;
  }, [inGame, injuredSet, loanedSet]);
  const sidelinedSet = useMemo(() => new Set(Object.keys(sidelined)), [sidelined]);
  const healthy = useMemo(() => inGame.filter((id) => touchCanPlay(state, id)), [inGame, state]);
  const sidelinedInGame = useMemo(() => inGame.filter((id) => sidelinedSet.has(id)), [inGame, sidelinedSet]);
  const gameMs = useMemo(() => Object.fromEntries(squad.map((p) => [p.id, touchGameMs(state, p.id)])), [squad, state]);
  // The side a mixed team can field from who can play (fewer when the
  // rule can't fill the game's size), else the game's size.
  const fieldPlan = useMemo(() => touchFieldPlan(game.on_field_size, healthy, mixed), [game.on_field_size, healthy, mixed]);
  const sideSize = fieldPlan?.size ?? game.on_field_size;

  // ── Strategies ─────────────────────────────────────────────
  const plan = useMemo(
    () =>
      suggestTouchBreakPlan({ state, ageGroup, onFieldSize: game.on_field_size, strategy: playStrategy, shapeId, prefs, season, mixed }),
    [state, ageGroup, game.on_field_size, playStrategy, shapeId, prefs, season, mixed],
  );
  const shape = useMemo(
    () => plan?.shape ?? touchShapeFor(ageGroup, playStrategy, Math.min(sideSize, healthy.length), shapeId),
    [plan, ageGroup, playStrategy, sideSize, healthy.length, shapeId],
  );
  const repeat = useMemo<TouchLineup>(
    () =>
      previousLineup
        ? benchOutInTouchLineup(previousLineup, sidelinedSet)
        : { lines: { middle: [], link: [], wing: [], field: [] }, bench: [...healthy] },
    [previousLineup, sidelinedSet, healthy],
  );
  const suggested = plan?.lineup ?? repeat;
  const manual = useMemo<TouchLineup>(
    () => ({ lines: { middle: [], link: [], wing: [], field: [] }, bench: [...healthy, ...sidelinedInGame] }),
    [healthy, sidelinedInGame],
  );
  // Rotate: everyone moves a lane out (middle → link → wing → middle),
  // the shape kept, the least-played on; under Minutes only, just the
  // least-played on. A mixed team's plan keeps its rule's split (the
  // suggestion's starters), so Rotate moves those kids.
  const rotated = useMemo<TouchLineup>(() => {
    const starters = mixed && plan ? touchOnField(plan.lineup) : healthy;
    const out = rotateGroups({
      players: starters,
      cycle: shape.lines.field > 0 ? ["field"] : [...TOUCH_LANES],
      caps: shape.lines,
      timeIn: (pid, g) => state.ms[pid]?.[g as TouchLine] ?? 0,
      total: (pid) => gameMs[pid] ?? 0,
      lastGroup: Object.fromEntries(starters.map((pid) => [pid, previousLineup ? touchLineOf(previousLineup, pid) ?? undefined : undefined])),
      sidelinedIds: sidelinedInGame,
    });
    const placed = new Set(Object.values(out.groups).flat());
    const bench = [...healthy.filter((id) => !placed.has(id)), ...sidelinedInGame];
    return lineupOf({ groups: out.groups, bench });
  }, [mixed, plan, healthy, shape, state.ms, gameMs, previousLineup, sidelinedInGame]);

  // ── The staged plan ─────────────────────────────────────────
  const persistedRotationMode = useLiveGame((s) => s.rotationMode);
  const setPersistedRotationMode = useLiveGame((s) => s.setRotationMode);
  const initialMode: BreakStrategy =
    persistedRotationMode === "manual" ? "manual" : persistedRotationMode === "rotate" ? "rotate" : "suggested";
  const [strategy, setStrategy] = useState<BreakStrategy>(initialMode);
  const forStrategy = (s: BreakStrategy) =>
    s === "suggested" ? suggested : s === "rotate" ? rotated : s === "repeat" ? repeat : manual;
  const [draft, setDraft] = useState<TouchLineup>(() => forStrategy(initialMode));
  const lastApplied = useRef<BreakStrategy>(initialMode);
  useEffect(() => {
    if (lastApplied.current === strategy) return;
    lastApplied.current = strategy;
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
    if (injured) setDraft((d) => benchOutInTouchLineup(d, new Set([pid])));
    void run(enqueueLiveAction("markInjury", [auth, game.id, { player_id: pid, injured, ...at }]).flushed);
  }
  function setLent(pid: string, loaned: boolean) {
    if (loaned) setDraft((d) => benchOutInTouchLineup(d, new Set([pid])));
    else setDraft((d) => (d.bench.includes(pid) || touchLineOf(d, pid) ? d : { ...d, bench: [...d.bench, pid] }));
    void run(enqueueLiveAction("markLoan", [auth, game.id, { player_id: pid, loaned, ...at }]).flushed);
  }
  function addArrived(pid: string) {
    setDraft((d) => (d.bench.includes(pid) ? d : { ...d, bench: [...d.bench, pid] }));
    void run(enqueueLiveAction("addLateArrival", [auth, game.id, { player_id: pid, ...at }]).flushed);
  }
  // Out: recorded as an injury (reason "out"); a replacement takes the
  // spot in the staged plan, committed with it at Start.
  function markOut(pid: string, replacementId: string | null) {
    setDraft((d) => {
      const line = touchLineOf(d, pid);
      const benched = benchOutInTouchLineup(d, new Set([pid]));
      return replacementId && line ? placeInTouchLineup(benched, replacementId, line) : benched;
    });
    void run(enqueueLiveAction("markInjury", [auth, game.id, { player_id: pid, injured: true, ...at, reason: "out" }]).flushed);
  }

  async function start() {
    setPending(true);
    setError(null);
    try {
      // Kids who can't play now start on the bench, places left empty.
      await enqueueLiveAction("recordTouchLineupSet", [auth, game.id, benchOutInTouchLineup(draft, sidelinedSet), undefined]).flushed;
      await enqueueLiveAction("startTouchPeriod", [auth, game.id, nextPeriod]).flushed;
      stagedBreakDraft.clear();
      void hapticTap("medium");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
      setPending(false);
      return;
    }
    setPending(false);
    router.refresh();
  }

  // ── The break screen ────────────────────────────────────────
  const shapeNow = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = { ...shape.lines };
    for (const l of GROUPS) out[l] = Math.max(out[l] ?? 0, draft.lines[l].length);
    return out;
  }, [shape, draft]);
  const config = useMemo(
    () => breakConfigFor(sport, ageGroup, { onFieldSize: sideSize, shape: shapeNow }),
    [sport, ageGroup, sideSize, shapeNow],
  );
  const withOut = (l: TouchLineup): StagedLineup => {
    const s = stagedOf(l);
    const onBoard = new Set([...Object.values(s.groups).flat(), ...s.bench]);
    return { groups: s.groups, bench: [...s.bench, ...sidelinedInGame.filter((id) => !onBoard.has(id))] };
  };
  const board = useMemo(() => buildBoard(config.zones, withOut(draft), sidelinedSet), [config.zones, draft, sidelinedSet]); // eslint-disable-line react-hooks/exhaustive-deps
  const previous = useMemo(() => (previousLineup ? placesOf(stagedOf(previousLineup)) : {}), [previousLineup]);

  const names = useMemo(() => Object.fromEntries(squad.map((p) => [p.id, p.full_name])), [squad]);
  const issues = useMemo(() => {
    // The lineup's own rules (the lane shape, nobody twice, the mixed
    // rule), then the shared 50% game-time floor.
    const check = (l: TouchLineup): RuleCheckItem[] => {
      // Kids who can't play aren't held to the rules.
      const benched = benchOutInTouchLineup(l, sidelinedSet);
      const lu = { ...benched, bench: benched.bench.filter((id) => !sidelinedSet.has(id)) };
      const items: RuleCheckItem[] = [];
      const valid = validateTouchLineup(lu, ageGroup, sideSize, mixed ?? null);
      valid.issues.forEach((issue, i) => {
        const mixedIssue = /boys|girls|Girl or Boy/.test(issue.message);
        items.push(
          issue.kind === "error"
            ? {
                id: `lineup-${i}`,
                status: "fail",
                text: issue.message,
                rule: mixedIssue && mixed ? mixedRuleSummary(mixed.rule) : "One place each, in the lanes the side plays",
                ...(issue.playerId ? { playerIds: [issue.playerId] } : {}),
              }
            : { id: `lineup-${i}`, status: "warn", text: issue.message },
        );
      });
      const onField: Record<string, string> = {};
      for (const g of GROUPS) for (const pid of lu.lines[g]) onField[pid] = g;
      const playedThisGame: Record<string, Record<string, number>> = {};
      for (const pid of [...Object.keys(onField), ...lu.bench]) {
        playedThisGame[pid] = Object.fromEntries(Object.entries(state.ms[pid] ?? {}).filter(([, v]) => typeof v === "number")) as Record<string, number>;
      }
      items.push(
        ...checkRules({
          onField,
          bench: lu.bench,
          lines: shape.lines.field > 0 ? ["field"] : [...TOUCH_LANES],
          lineLabel: (k) => LINE_LABEL[k] ?? k,
          name: (pid) => names[pid] ?? "A player",
          playedThisGame,
          benchedLastPeriod: previousLineup ? previousLineup.bench : [],
          period: nextPeriod,
          periodCount: ageGroup.periodCount,
          periodMs,
          periodWord: "half",
          lineWord: "lane",
          minGameTimePct: 50,
          rules: [],
        }),
      );
      return items;
    };
    return breakIssues({
      lineup: draft,
      check,
      board: (l) => buildBoard(config.zones, withOut(l), sidelinedSet),
      swap: swapSlots,
      sidelined: sidelinedSet,
      // The lineup check already says "playing short".
      emptySpots: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, sidelinedSet, ageGroup, sideSize, mixed, state.ms, shape, names, previousLineup, nextPeriod, periodMs, config.zones]);

  const asBreakPlayer = (p: Player): BreakPlayer => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number });
  const players = useMemo(() => new Map(squad.map((p) => [p.id, asBreakPlayer(p)])), [squad]);
  const scores = useMemo(() => {
    const out: Record<string, { text: string; label: string }> = {};
    for (const [pid, n] of Object.entries(state.playerTries)) if (n > 0) out[pid] = { text: String(n), label: `${n} ${n === 1 ? "try" : "tries"}` };
    return out;
  }, [state.playerTries]);
  const placed = new Set(inGame);
  const canPlay = squad.filter((p) => !sidelinedSet.has(p.id));
  const onFieldNow = touchOnField(draft).filter((id) => !sidelinedSet.has(id));
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
      sidelined={sidelined}
      onSwap={(a, b) => setDraft((d) => swapSlots(d, a, b))}
      strategy={strategy}
      onStrategy={(next) => {
        setStrategy(next);
        if (next !== "repeat") setPersistedRotationMode(next === "rotate" ? "rotate" : next === "manual" ? "manual" : "suggested");
      }}
      issues={issues}
      score={score ? { line: config.formatScore({ us: {}, them: {}, points: { us: score.us, them: score.them } }), editor: score.editor } : undefined}
      settings={{
        injured: {
          players: squad.filter((p) => injuredSet.has(p.id)).map(asBreakPlayer),
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
          candidates: onFieldNow.map((id) => playerById.get(id)).filter((p): p is Player => !!p).map(asBreakPlayer),
          replacements: benchNow
            .map((id) => playerById.get(id))
            .filter((p): p is Player => !!p)
            .map<InjuryReplacementCandidate>((p) => ({ player: p, totalMs: gameMs[p.id] ?? 0 }))
            .sort((a, b) => a.totalMs - b.totalMs),
          spotLabel: (pid) => {
            const line = touchLineOf(draft, pid);
            return line ? config.zones.find((z) => z.key === line)?.short ?? null : null;
          },
          player: (pid) => playerById.get(pid),
          onOut: markOut,
        },
        pending,
        error,
      }}
      start={{ onStart: () => void start(), pending, cue: "whistle goes", error }}
    />
  );
}
