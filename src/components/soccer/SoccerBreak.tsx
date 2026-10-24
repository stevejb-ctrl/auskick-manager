"use client";

// ─── The soccer family's break ────────────────────────────────
// Soccer's, futsal's and hockey's break plan (suggestSoccerHalfTime: who
// goes in goal, who plays and where), their writers and keeper rules,
// adapted onto the one break screen every sport shares (quarter-break/
// PeriodBreak), in the sport's own line words (Attack / Midfield /
// Defence / Keeper, futsal's Front / Wings / Back, hockey's Strikers /
// Midfield / Defenders) and its age group's halves or quarters. Where
// keeper kit takes minutes (hockey), the kid told to kit up before the
// break starts in goal, whichever plan the coach picks (Manual aside).
// The plan is staged in the shared break draft (so it survives a reload
// or the app being backgrounded) and Start commits it as one lineup_set
// before the period starts. The layout lives in PeriodBreak.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { useStagedBreakDraft } from "@/lib/live/useStagedBreakDraft";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { hapticTap } from "@/lib/haptics";
import { QuarterScoreTable } from "@/components/live/QuarterScoreTable";
import { ScoreReviewPanel } from "@/components/live/ScoreReviewPanel";
import { type InjuryReplacementCandidate } from "@/components/live/InjuryReplacementModal";
import { PeriodBreak, type BreakPlayer, type BreakStrategy } from "@/components/quarter-break/PeriodBreak";
import { breakConfigFor } from "@/lib/sports/break";
import { periodLabels, type SoccerSport } from "@/lib/sports";
import { soccerFamilyRules } from "@/lib/sports/soccer/family";
import { buildBoard, placesOf, type BoardSlot, type StagedLineup } from "@/lib/live/break/board";
import { breakIssues } from "@/lib/live/break/issues";
import { rotateGroups } from "@/lib/live/break/rotateGroups";
import { soccerOnField, soccerUnitOf, type SoccerLineup } from "@/lib/sports/soccer/lineup";
import { soccerGameMs, type SoccerGameState } from "@/lib/sports/soccer/replay";
import { suggestSoccerHalfTime, type SoccerHalfTimePlan, type SoccerSeasonBalance } from "@/lib/sports/soccer/suggest";
import { benchOutInSoccerLineup, placeInSoccerLineup, swapInSoccerLineup } from "@/lib/sports/soccer/live";
import { soccerBreakCheck } from "@/lib/sports/soccer/breakCheck";
import type { SoccerKeeperPrefs } from "@/lib/sports/soccer/keeper";
import {
  SOCCER_LINES,
  type SoccerAgeGroupConfig,
  type SoccerFormation,
  type SoccerKeeperStrategy,
  type SoccerLine,
  type SoccerUnit,
} from "@/lib/sports/soccer/types";
import type { Game, LiveAuth, Player } from "@/lib/types";
import { breakPlansWithKeeper, kitUpKey, preferAnnouncedKeeper, readKitUp, writeKitUp } from "./keeperKitUp";

const GROUPS = ["att", "mid", "def", "field", "gk"] as const;

function stagedOf(l: SoccerLineup): StagedLineup {
  return {
    groups: { att: l.lines.att, mid: l.lines.mid, def: l.lines.def, field: l.lines.field, gk: l.keeper ? [l.keeper] : [] },
    bench: l.bench,
  };
}

function lineupOf(s: StagedLineup, slots?: Record<string, string>): SoccerLineup {
  return {
    keeper: s.groups.gk?.[0] ?? null,
    lines: { def: s.groups.def ?? [], mid: s.groups.mid ?? [], att: s.groups.att ?? [], field: s.groups.field ?? [] },
    bench: s.bench,
    ...(slots ? { slots } : {}),
  };
}

/** Soccer's own swap: kids trade places (positions with them); one into an empty spot. */
function swapSlots(l: SoccerLineup, a: BoardSlot, b: BoardSlot): SoccerLineup {
  if (a.playerId && b.playerId) return swapInSoccerLineup(l, a.playerId, b.playerId);
  const [kid, spot] = a.playerId ? [a.playerId, b] : [b.playerId as string, a];
  if (spot.zone === "bench") return l;
  return placeInSoccerLineup(l, kid, spot.zone as SoccerUnit);
}

interface Props {
  auth: LiveAuth;
  /** The team's sport: its line words and keeper rules. */
  sport: SoccerSport;
  game: Game;
  exitHref?: string;
  squad: Player[];
  ageGroup: SoccerAgeGroupConfig;
  /** The game at the break (no open stints). */
  state: SoccerGameState;
  periodMs: number;
  /** Our name, over our column in the score sheet. */
  teamName: string;
  trackScoring: boolean;
  season?: SoccerSeasonBalance;
  keeperStrategy?: SoccerKeeperStrategy;
  keeperPrefs?: SoccerKeeperPrefs;
  /** The shape the last lineup played (its line counts). */
  formation: SoccerFormation;
}

export function SoccerBreak({
  auth,
  sport,
  game,
  exitHref,
  squad,
  ageGroup,
  state,
  periodMs,
  teamName,
  trackScoring,
  season,
  keeperStrategy,
  keeperPrefs,
  formation,
}: Props) {
  const router = useRouter();
  const period = state.currentPeriod; // the half just ended
  const nextPeriod = period + 1;
  const rules = soccerFamilyRules(sport);
  const periodLabel = periodLabels(sport, ageGroup).label;
  const periodLetter = periodLabel.charAt(0).toUpperCase();
  const periodTitle = periodLetter + periodLabel.slice(1);
  const strategyForKeeper = keeperStrategy ?? ageGroup.keeper;
  const playerById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);
  const injuredSet = useMemo(() => new Set(state.injuredIds), [state.injuredIds]);
  const loanedSet = useMemo(() => new Set(state.loanedIds), [state.loanedIds]);
  const sidelinedSet = useMemo(() => new Set([...state.injuredIds, ...state.loanedIds]), [state.injuredIds, state.loanedIds]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const previousLineup = state.lineup;
  const inGame = useMemo(
    () => (previousLineup ? [...soccerOnField(previousLineup), ...previousLineup.bench] : []),
    [previousLineup],
  );
  const healthy = useMemo(() => inGame.filter((id) => !sidelinedSet.has(id)), [inGame, sidelinedSet]);
  const sidelinedInGame = useMemo(() => inGame.filter((id) => sidelinedSet.has(id)), [inGame, sidelinedSet]);
  const gameMs = useMemo(() => Object.fromEntries(squad.map((p) => [p.id, soccerGameMs(state, p.id)])), [squad, state]);

  // ── Strategies ─────────────────────────────────────────────
  const plan = useMemo<SoccerHalfTimePlan>(
    () =>
      suggestSoccerHalfTime({
        state,
        ageGroup,
        onFieldSize: game.on_field_size,
        formationId: formation.id,
        season,
        keeperStrategy,
        prefs: keeperPrefs,
      }) ?? {
        // No lineup to plan from (never at a real break): start empty.
        keeper: { from: null, to: null },
        lineup: { keeper: null, lines: { def: [], mid: [], att: [], field: [] }, bench: [] },
        formation,
      },
    [state, ageGroup, game.on_field_size, formation, season, keeperStrategy, keeperPrefs],
  );
  // The kid the kit-up heads-up named (hockey) starts in goal. Read once
  // the break is on screen (session storage isn't there to render with).
  const [announcedKeeper, setAnnouncedKeeper] = useState<string | null>(null);
  useEffect(() => {
    setAnnouncedKeeper(readKitUp(kitUpKey(game.id, period)));
  }, [game.id, period]);
  const manual = useMemo<SoccerLineup>(
    () => ({ keeper: null, lines: { def: [], mid: [], att: [], field: [] }, bench: [...healthy, ...sidelinedInGame] }),
    [healthy, sidelinedInGame],
  );
  // Rotate: the half-time plan's keeper goes in goal; everyone else moves
  // up a line (defence → midfield → attack → defence), the shape kept,
  // least-played on, each kid only to a line their "Plays as" names.
  const rotatedPlan = useMemo<SoccerLineup>(() => {
    const keeper = plan.formation.keeper ? plan.lineup.keeper : null;
    const shape = plan.formation.lines;
    const out = rotateGroups({
      players: healthy.filter((id) => id !== keeper),
      cycle: shape.field > 0 ? ["field"] : ["def", "mid", "att"],
      caps: shape,
      timeIn: (pid, g) => state.ms[pid]?.[g as SoccerUnit] ?? 0,
      total: (pid) => gameMs[pid] ?? 0,
      lastGroup: Object.fromEntries(
        healthy.map((pid) => {
          const unit = previousLineup ? soccerUnitOf(previousLineup, pid) : null;
          return [pid, unit && unit !== "gk" ? unit : undefined];
        }),
      ),
      sidelinedIds: sidelinedInGame,
      plays: (pid, line) => line === "field" || !keeperPrefs?.notInLine?.[pid]?.includes(line as SoccerLine),
    });
    return lineupOf({ groups: { ...out.groups, gk: keeper ? [keeper] : [] }, bench: out.bench });
  }, [plan, healthy, state.ms, gameMs, previousLineup, sidelinedInGame, keeperPrefs]);
  // Every plan but Manual puts the kit-up keeper in goal.
  const {
    suggested,
    rotate: rotated,
    repeat,
  } = useMemo(
    () =>
      breakPlansWithKeeper(
        {
          suggested: plan.lineup,
          rotate: rotatedPlan,
          repeat: previousLineup ? benchOutInSoccerLineup(previousLineup, sidelinedSet) : plan.lineup,
          manual,
        },
        announcedKeeper,
        sidelinedSet,
      ),
    [plan.lineup, rotatedPlan, previousLineup, sidelinedSet, manual, announcedKeeper],
  );

  // ── The staged plan ─────────────────────────────────────────
  const persistedRotationMode = useLiveGame((s) => s.rotationMode);
  const setPersistedRotationMode = useLiveGame((s) => s.setRotationMode);
  const initialMode: BreakStrategy =
    persistedRotationMode === "manual" ? "manual" : persistedRotationMode === "rotate" ? "rotate" : "suggested";
  const [strategy, setStrategy] = useState<BreakStrategy>(initialMode);
  const forStrategy = (s: BreakStrategy) =>
    s === "suggested" ? suggested : s === "rotate" ? rotated : s === "repeat" ? repeat : manual;
  const [draft, setDraft] = useState<SoccerLineup>(() => forStrategy(initialMode));
  // A strategy only re-derives the plan when the coach picks it, never
  // when the suggestion recomputes underneath their edits.
  const lastApplied = useRef<BreakStrategy>(initialMode);
  useEffect(() => {
    if (lastApplied.current === strategy) return;
    lastApplied.current = strategy;
    setDraft(forStrategy(strategy));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy]);
  // The kit-up keeper is read after the first render: put them in goal
  // then, once, in the plan on screen (Manual's is empty), unless the
  // coach has already shaped the plan or a staged one was restored.
  const shaped = useRef(false);
  useEffect(() => {
    if (!announcedKeeper || shaped.current || lastApplied.current === "manual") return;
    shaped.current = true;
    setDraft(forStrategy(lastApplied.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcedKeeper]);

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
      shaped.current = true;
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
    if (injured) setDraft((d) => benchOutInSoccerLineup(d, new Set([pid])));
    void run(enqueueLiveAction("markInjury", [auth, game.id, { player_id: pid, injured, ...at }]).flushed);
  }
  function setLent(pid: string, loaned: boolean) {
    if (loaned) setDraft((d) => benchOutInSoccerLineup(d, new Set([pid])));
    else setDraft((d) => (d.bench.includes(pid) || soccerUnitOf(d, pid) ? d : { ...d, bench: [...d.bench, pid] }));
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
      const unit = soccerUnitOf(d, pid);
      const benched = benchOutInSoccerLineup(d, new Set([pid]));
      return replacementId && unit ? placeInSoccerLineup(benched, replacementId, unit) : benched;
    });
    void run(enqueueLiveAction("markInjury", [auth, game.id, { player_id: pid, injured: true, ...at, reason: "out" }]).flushed);
  }

  async function start() {
    setPending(true);
    setError(null);
    try {
      // Kids who can't play now start on the bench, their places left empty.
      await enqueueLiveAction("recordSoccerLineupSet", [auth, game.id, benchOutInSoccerLineup(draft, sidelinedSet), undefined])
        .flushed;
      await enqueueLiveAction("startSoccerHalf", [auth, game.id, nextPeriod]).flushed;
      stagedBreakDraft.clear();
      // The kit-up heads-up's job is done once the period starts.
      writeKitUp(kitUpKey(game.id, period), "");
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
  const shape = useMemo<Record<string, number>>(() => {
    const target = plan.formation;
    const out: Record<string, number> = { ...target.lines, gk: target.keeper ? 1 : 0 };
    for (const l of SOCCER_LINES) out[l] = Math.max(out[l], draft.lines[l].length);
    return out;
  }, [plan.formation, draft]);
  const config = useMemo(
    () =>
      breakConfigFor(sport, ageGroup, { onFieldSize: game.on_field_size, shape }),
    [sport, ageGroup, game.on_field_size, shape],
  );
  const sidelined = useMemo(() => {
    const out: Record<string, string> = {};
    for (const id of sidelinedInGame) out[id] = injuredSet.has(id) ? "Injured" : "Lent";
    return out;
  }, [sidelinedInGame, injuredSet]);
  const withOut = (l: SoccerLineup): StagedLineup => {
    const s = stagedOf(l);
    const onBoard = new Set([...Object.values(s.groups).flat(), ...s.bench]);
    return { groups: s.groups, bench: [...s.bench, ...sidelinedInGame.filter((id) => !onBoard.has(id))] };
  };
  const board = useMemo(() => buildBoard(config.zones, withOut(draft), sidelinedSet), [config.zones, draft, sidelinedSet]); // eslint-disable-line react-hooks/exhaustive-deps
  const previous = useMemo(() => (previousLineup ? placesOf(stagedOf(previousLineup)) : {}), [previousLineup]);

  const names = useMemo(() => Object.fromEntries(squad.map((p) => [p.id, p.full_name])), [squad]);
  const issues = useMemo(
    () =>
      breakIssues({
        lineup: draft,
        check: (l) => {
          // Kids who can't play aren't held to the rules.
          const out = benchOutInSoccerLineup(l, sidelinedSet);
          return soccerBreakCheck({
            lineup: { ...out, bench: out.bench.filter((id) => !sidelinedSet.has(id)) },
            state,
            ageGroup,
            rules,
            onFieldSize: game.on_field_size,
            period: nextPeriod,
            periodMs,
            names,
            keeperStrategy: strategyForKeeper,
            prefs: keeperPrefs,
          });
        },
        board: (l) => buildBoard(config.zones, withOut(l), sidelinedSet),
        swap: swapSlots,
        sidelined: sidelinedSet,
        // Soccer's own check already says "playing short".
        emptySpots: false,
        // Fix puts the kit-up keeper in goal before anyone else.
        preferFix: preferAnnouncedKeeper(announcedKeeper),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, sidelinedSet, state, ageGroup, rules, game.on_field_size, nextPeriod, periodMs, names, strategyForKeeper, keeperPrefs, config.zones, announcedKeeper],
  );

  const asBreakPlayer = (p: Player): BreakPlayer => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number });
  const players = useMemo(() => new Map(squad.map((p) => [p.id, asBreakPlayer(p)])), [squad]);
  const scores = useMemo(() => {
    const out: Record<string, { text: string; label: string }> = {};
    for (const [pid, n] of Object.entries(state.playerGoals)) if (n > 0) out[pid] = { text: String(n), label: `${n} goals` };
    return out;
  }, [state.playerGoals]);
  const placed = new Set(inGame);
  const canPlay = squad.filter((p) => !sidelinedSet.has(p.id));
  const onFieldNow = soccerOnField(draft).filter((id) => !sidelinedSet.has(id));
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
      onSwap={(a, b) => {
        shaped.current = true;
        setDraft((d) => swapSlots(d, a, b));
      }}
      strategy={strategy}
      onStrategy={(next) => {
        shaped.current = true;
        setStrategy(next);
        if (next !== "repeat") setPersistedRotationMode(next === "rotate" ? "rotate" : next === "manual" ? "manual" : "suggested");
      }}
      issues={issues}
      score={
        trackScoring
          ? {
              line: config.formatScore({ us: { goal: state.teamScore.goals }, them: { goal: state.opponentScore.goals } }),
              editor: (
                <div className="space-y-4">
                  <QuarterScoreTable
                    scoreByQuarter={[
                      { ours: { goals: 0 }, theirs: { goals: 0 } },
                      ...Array.from({ length: ageGroup.periodCount }, (_, i) => ({
                        ours: { goals: state.scoreByPeriod[i + 1]?.ours ?? 0 },
                        theirs: { goals: state.scoreByPeriod[i + 1]?.theirs ?? 0 },
                      })),
                    ]}
                    currentQuarter={period}
                    quarterEnded={true}
                    sport="netball"
                    totalQuarters={ageGroup.periodCount}
                    periodLetter={periodLetter}
                    periodWord={periodTitle}
                    teamName={teamName}
                    opponentName={game.opponent || "Them"}
                  />
                  <div className="border-t border-hairline pt-4">
                    <ScoreReviewPanel
                      auth={auth}
                      gameId={game.id}
                      players={squad}
                      includeBehinds={false}
                      defaultQuarter={period}
                      periodCount={ageGroup.periodCount}
                      periodLetter={periodLetter}
                      periodWord={periodTitle}
                    />
                  </div>
                </div>
              ),
            }
          : undefined
      }
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
            const unit = soccerUnitOf(draft, pid);
            return unit ? config.zones.find((z) => z.key === unit)?.short ?? null : null;
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
