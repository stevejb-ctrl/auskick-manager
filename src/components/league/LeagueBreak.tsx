"use client";

// ─── Rugby (league and union): the period break ──────────────
// Rugby's break adapted onto the one break screen every sport shares
// (quarter-break/PeriodBreak): Forwards / Backs / Bench, "Q3" or "2nd
// half" by the age group's periods. The break used to save every edit as
// an event as it was made; it now stages the next period's lineup in the
// shared break draft (as every sport does) and Start commits it as one
// lineup_set. A pinned plan (F2) opens the break, as before. League's
// vests are a status chip under the score ("FR Kira · DH Maya") opening
// the vest picker in a sheet, as game settings does (UI polish round 2
// R1: the picker sat under the bench, twice the height of the lineup);
// union has no vests. Vest picks still save as they're made. The layout
// lives in PeriodBreak.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { useStagedBreakDraft } from "@/lib/live/useStagedBreakDraft";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { hapticTap } from "@/lib/haptics";
import { type InjuryReplacementCandidate } from "@/components/live/InjuryReplacementModal";
import { PeriodBreak, type BreakPlayer, type BreakStrategy } from "@/components/quarter-break/PeriodBreak";
import { VestAssignmentCard } from "./VestAssignmentCard";
import { breakConfigFor } from "@/lib/sports/break";
import { buildBoard, placesOf, swapInStaged, type BoardSlot, type StagedLineup } from "@/lib/live/break/board";
import { breakIssues } from "@/lib/live/break/issues";
import { rotateGroups } from "@/lib/live/break/rotateGroups";
import { getSportConfig, periodLabels, type RugbySport } from "@/lib/sports";
import { rugbyForwards } from "@/lib/sports/rugby/lines";
import { rugbyBreakCheck } from "@/lib/sports/rugby/breakCheck";
import { assignLeaguePositions, withLeagueSlots, type LeaguePlaybookInput } from "@/lib/sports/rugby_league/engine";
import {
  playerZoneMsOnField,
  unbrokenPeriodLiveStatus,
  unbrokenPeriodsRequired,
  type LeagueGameState,
} from "@/lib/sports/rugby_league/fairness";
import { currentVests } from "@/lib/sports/rugby_league/vests";
import { consumePeriodPin } from "@/lib/game-plan";
import { leagueBreakSuggestion } from "@/lib/sports/rugby/breakSuggestion";
import { benchSidelinedInLeagueLineup, plannedLeagueLineup } from "@/lib/live/lineupOps";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { ChipKey, ChipMode } from "@/lib/chips";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";
import { useSquadNames } from "@/components/live/SquadNames";

type Lineup = { forwards: string[]; backs: string[]; bench: string[] };
const GROUPS = ["forwards", "backs"] as const;

const stagedOf = (l: Lineup): StagedLineup => ({ groups: { forwards: l.forwards, backs: l.backs }, bench: l.bench });
const lineupOf = (s: StagedLineup): Lineup => ({ forwards: s.groups.forwards ?? [], backs: s.groups.backs ?? [], bench: s.bench });
const swapSlots = (l: Lineup, a: BoardSlot, b: BoardSlot): Lineup => lineupOf(swapInStaged(stagedOf(l), a, b));

interface Props {
  auth: LiveAuth;
  sport: RugbySport;
  game: Game;
  exitHref?: string;
  onHelp?: () => void;
  squad: Player[];
  ageGroup: AgeGroupConfig;
  state: LeagueGameState;
  events: GameEvent[];
  periodSeconds: number;
  injured: ReadonlySet<string>;
  loaned: ReadonlySet<string>;
  /** Game time so far, ms. */
  msByPlayer: Record<string, number>;
  leaguePlaybook?: LeaguePlaybookInput;
  chipModes?: Partial<Record<ChipKey, ChipMode>>;
  isAdmin: boolean;
  /** The score chip's editor (the scorebug's chips), when keeping score. */
  scoreEditor?: ReactNode;
}

export function LeagueBreak({
  auth,
  sport,
  game,
  exitHref,
  onHelp,
  squad,
  ageGroup,
  state,
  events,
  periodSeconds,
  injured,
  loaned,
  msByPlayer,
  leaguePlaybook,
  chipModes,
  isAdmin,
  scoreEditor,
}: Props) {
  const router = useRouter();
  const nextPeriod = state.currentQuarter + 1;
  const { label: periodWord } = periodLabels(sport, ageGroup);
  const playerById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);
  const squadNames = useSquadNames();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const sidelinedSet = useMemo(() => new Set([...Array.from(injured), ...Array.from(loaned)]), [injured, loaned]);
  const previousLineup = useMemo<Lineup>(
    () => state.lineup ?? { forwards: [], backs: [], bench: [] },
    [state.lineup],
  );
  const inGame = useMemo(
    () => [...previousLineup.forwards, ...previousLineup.backs, ...previousLineup.bench],
    [previousLineup],
  );
  const healthy = useMemo(() => inGame.filter((id) => !sidelinedSet.has(id)), [inGame, sidelinedSet]);
  const sidelinedInGame = useMemo(() => inGame.filter((id) => sidelinedSet.has(id)), [inGame, sidelinedSet]);
  const zoneMs = useMemo(() => playerZoneMsOnField(events, state.currentQuarter, state.quarterElapsedMs ?? 0), [events, state]);

  // ── Strategies ─────────────────────────────────────────────
  const plannedRotation = useLiveGame((s) => s.plannedRotation);
  const setPlannedRotation = useLiveGame((s) => s.setPlannedRotation);
  const pin = plannedRotation && plannedRotation.gameId === game.id ? plannedRotation : null;
  const seeded = useMemo(
    () =>
      state.lineup
        ? plannedLeagueLineup({ pin, periodIndex: state.currentQuarter, lineup: state.lineup, squad, injured, loaned })
        : null,
    [state.lineup, state.currentQuarter, pin, squad, injured, loaned],
  );
  const repeat = useMemo(() => benchSidelinedInLeagueLineup(previousLineup, sidelinedSet), [previousLineup, sidelinedSet]);
  // Suggested: the next period of the planner's own projection, lines
  // by the kids' roles (breakSuggestion.ts).
  const suggested = useMemo<Lineup>(
    () =>
      leagueBreakSuggestion({
        sport,
        ageGroup,
        squad,
        previousLineup,
        injured,
        loaned,
        onFieldSize: game.on_field_size,
        currentQuarter: state.currentQuarter,
        chipModes,
        leaguePlaybook,
      }),
    [sport, ageGroup, squad, previousLineup, injured, loaned, game.on_field_size, state.currentQuarter, chipModes, leaguePlaybook],
  );
  const manual = useMemo<Lineup>(() => ({ forwards: [], backs: [], bench: [...healthy, ...sidelinedInGame] }), [healthy, sidelinedInGame]);
  // Rotate: forwards and backs swap lines, the split kept, least-played on.
  const caps = useMemo(() => {
    const onField = Math.min(game.on_field_size, healthy.length);
    const forwards = rugbyForwards(ageGroup, game.on_field_size);
    return { forwards: Math.min(forwards, onField), backs: Math.max(0, onField - forwards) };
  }, [game.on_field_size, healthy.length, ageGroup]);
  const rotated = useMemo<Lineup>(() => {
    const out = rotateGroups({
      players: healthy,
      cycle: ["forwards", "backs"],
      caps,
      timeIn: (pid, g) => (g === "forwards" ? zoneMs[pid]?.forwards : zoneMs[pid]?.backs) ?? 0,
      total: (pid) => msByPlayer[pid] ?? 0,
      lastGroup: Object.fromEntries(
        healthy.map((pid) => [
          pid,
          previousLineup.forwards.includes(pid) ? "forwards" : previousLineup.backs.includes(pid) ? "backs" : undefined,
        ]),
      ),
      sidelinedIds: sidelinedInGame,
    });
    return lineupOf(out);
  }, [healthy, caps, zoneMs, msByPlayer, previousLineup, sidelinedInGame]);

  // ── The staged lineup ───────────────────────────────────────
  const persistedRotationMode = useLiveGame((s) => s.rotationMode);
  const setPersistedRotationMode = useLiveGame((s) => s.setRotationMode);
  const initialMode: BreakStrategy =
    persistedRotationMode === "manual" ? "manual" : persistedRotationMode === "rotate" ? "rotate" : "suggested";
  const [strategy, setStrategy] = useState<BreakStrategy>(initialMode);
  const forStrategy = (s: BreakStrategy) =>
    s === "suggested" ? suggested : s === "rotate" ? rotated : s === "repeat" ? repeat : manual;
  // A pinned plan for this period opens the break (F2 / D-12).
  const [draft, setDraft] = useState<Lineup>(() => seeded ?? forStrategy(initialMode));
  const lastApplied = useRef<BreakStrategy>(initialMode);
  useEffect(() => {
    if (lastApplied.current === strategy) return;
    lastApplied.current = strategy;
    setDraft(forStrategy(strategy));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy]);
  // The live store hydrates after the first render (its storage is
  // async), so the pin usually lands once the break is open: seed the
  // draft from it then, once, unless the coach has already shaped the
  // draft or a staged one was restored.
  const shaped = useRef(false);
  useEffect(() => {
    if (!seeded || shaped.current) return;
    shaped.current = true;
    setDraft(seeded);
  }, [seeded]);

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
  const benchOut = (l: Lineup, pid: string) => benchSidelinedInLeagueLineup(l, new Set([pid]));
  function setInjured(pid: string, on: boolean) {
    if (on) setDraft((d) => benchOut(d, pid));
    void run(enqueueLiveAction("markInjury", [auth, game.id, { player_id: pid, injured: on, ...at }]).flushed);
  }
  function setLent(pid: string, on: boolean) {
    if (on) setDraft((d) => benchOut(d, pid));
    else setDraft((d) => ([...d.forwards, ...d.backs, ...d.bench].includes(pid) ? d : { ...d, bench: [...d.bench, pid] }));
    void run(enqueueLiveAction("markLoan", [auth, game.id, { player_id: pid, loaned: on, ...at }]).flushed);
  }
  function addArrived(pid: string) {
    setDraft((d) => (d.bench.includes(pid) ? d : { ...d, bench: [...d.bench, pid] }));
    void run(enqueueLiveAction("addLateArrival", [auth, game.id, { player_id: pid, ...at }]).flushed);
  }
  // Out (reason "out"); a replacement takes their line in the staged
  // lineup, committed with it at Start.
  function markOut(pid: string, replacementId: string | null) {
    setDraft((d) => {
      const line = d.forwards.includes(pid) ? "forwards" : d.backs.includes(pid) ? "backs" : null;
      const off = benchOut(d, pid);
      if (!replacementId || !line) return off;
      return {
        ...off,
        [line]: [...off[line].filter((id) => id !== replacementId), replacementId],
        bench: off.bench.filter((id) => id !== replacementId),
      };
    });
    void run(enqueueLiveAction("markInjury", [auth, game.id, { player_id: pid, injured: true, ...at, reason: "out" }]).flushed);
  }

  async function start() {
    setPending(true);
    setError(null);
    try {
      // Kids who can't play start on the bench, their places left empty.
      const lineup = benchSidelinedInLeagueLineup(draft, sidelinedSet);
      await enqueueLiveAction("recordLeagueLineupSet", [
        auth,
        game.id,
        // Named positions: record each kid's slot (UX plan 5.7).
        withLeagueSlots(lineup, leaguePlaybook),
        undefined,
      ]).flushed;
      await enqueueLiveAction("startLeagueQuarter", [auth, game.id, nextPeriod]).flushed;
      // This period's plan is used; later planned periods stay (D-14).
      if (pin) setPlannedRotation(consumePeriodPin(pin, state.currentQuarter));
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
  const shape = useMemo(
    () => ({ forwards: Math.max(caps.forwards, draft.forwards.length), backs: Math.max(caps.backs, draft.backs.length) }),
    [caps, draft],
  );
  const config = useMemo(
    () => breakConfigFor(sport, ageGroup, { onFieldSize: game.on_field_size, shape }),
    [sport, ageGroup, game.on_field_size, shape],
  );
  const sidelined = useMemo(() => {
    const out: Record<string, string> = {};
    for (const id of sidelinedInGame) out[id] = injured.has(id) ? "Injured" : "Lent";
    return out;
  }, [sidelinedInGame, injured]);
  const withOut = (l: Lineup): StagedLineup => {
    const s = stagedOf(l);
    const onBoard = new Set([...l.forwards, ...l.backs, ...l.bench]);
    return { groups: s.groups, bench: [...s.bench, ...sidelinedInGame.filter((id) => !onBoard.has(id))] };
  };
  // Named positions: each kid's position as Start will record it, on
  // their tile, the lines read in the list's order (UX audit, 23 Oct
  // 2026: the break said only Forwards / Backs, so the front row going
  // to a fullback went unseen).
  const dealt = useMemo(
    () => (leaguePlaybook?.positions?.length ? assignLeaguePositions(benchSidelinedInLeagueLineup(draft, sidelinedSet), leaguePlaybook) : {}),
    [leaguePlaybook, draft, sidelinedSet],
  );
  const positionLabels = useMemo(() => {
    const labelOf = new Map((leaguePlaybook?.positions ?? []).map((p) => [p.key, p.label]));
    return Object.fromEntries(Object.entries(dealt).map(([pid, key]) => [pid, labelOf.get(key) ?? key]));
  }, [dealt, leaguePlaybook]);
  const inPositionOrder = (l: Lineup): Lineup => {
    const keys = (leaguePlaybook?.positions ?? []).map((p) => p.key);
    if (keys.length === 0) return l;
    const at = (pid: string) => (dealt[pid] ? keys.indexOf(dealt[pid]) : keys.length);
    const sort = (ids: string[]) => [...ids].sort((a, b) => at(a) - at(b));
    return { ...l, forwards: sort(l.forwards), backs: sort(l.backs) };
  };
  const board = useMemo(() => buildBoard(config.zones, withOut(inPositionOrder(draft)), sidelinedSet), [config.zones, draft, sidelinedSet, dealt]); // eslint-disable-line react-hooks/exhaustive-deps
  const previous = useMemo(() => placesOf(stagedOf(previousLineup)), [previousLineup]);

  const names = useMemo(() => Object.fromEntries(squad.map((p) => [p.id, p.full_name])), [squad]);
  const unbroken = useMemo(() => {
    // §6 wherever the grade plays it (no switch: it's the laws).
    const required = unbrokenPeriodsRequired(ageGroup);
    if (required <= 0) return undefined;
    const status = unbrokenPeriodLiveStatus(events, required);
    return { required, done: Object.fromEntries(Object.entries(status).map(([pid, s]) => [pid, s.unbrokenPeriods.length])) };
  }, [ageGroup, events]);
  const issues = useMemo(
    () =>
      breakIssues({
        lineup: draft,
        check: (l) => {
          // Kids who can't play aren't held to the rules.
          const lu = benchSidelinedInLeagueLineup(l, sidelinedSet);
          const bench = lu.bench.filter((id) => !sidelinedSet.has(id));
          const played: Record<string, Record<string, number>> = {};
          for (const pid of [...lu.forwards, ...lu.backs, ...bench]) {
            const z = zoneMs[pid];
            played[pid] = z ? { forwards: z.forwards, backs: z.backs, vest: z.centre } : {};
          }
          return rugbyBreakCheck({
            lineup: { ...lu, bench },
            ageGroup,
            names,
            playedThisGame: played,
            benchedLastPeriod: previousLineup.bench,
            period: nextPeriod,
            periodMs: periodSeconds * 1000,
            periodWord,
            rules: leaguePlaybook?.rules,
            minGameTimePct: leaguePlaybook?.minGameTimePct,
            homeLine: leaguePlaybook ? Object.fromEntries(Object.entries(leaguePlaybook.roles).map(([pid, r]) => [pid, r.home])) : undefined,
            unbroken,
            positions: leaguePlaybook?.positions?.length ? leaguePlaybook : undefined,
          });
        },
        board: (l) => buildBoard(config.zones, withOut(l), sidelinedSet),
        swap: swapSlots,
        sidelined: sidelinedSet,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, sidelinedSet, zoneMs, ageGroup, names, previousLineup, nextPeriod, periodSeconds, periodWord, leaguePlaybook, unbroken, config.zones],
  );

  const asBreakPlayer = (p: Player): BreakPlayer => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number });
  const players = useMemo(() => new Map(squad.map((p) => [p.id, asBreakPlayer(p)])), [squad]);
  const scores = useMemo(() => {
    const out: Record<string, { text: string; label: string }> = {};
    for (const [pid, n] of Object.entries(state.playerTries)) if (n > 0) out[pid] = { text: `${n}T`, label: `${n} tries` };
    return out;
  }, [state.playerTries]);
  // League: next period's vest wearers on their tiles.
  const vestRequired = !!(ageGroup.vestRequirements?.fr || ageGroup.vestRequirements?.dh);
  const tags = useMemo(() => {
    if (!vestRequired) return undefined;
    const v = currentVests(events, nextPeriod);
    const out: Record<string, string[]> = {};
    if (v.fr) out[v.fr] = ["FR"];
    if (v.dh) out[v.dh] = [...(out[v.dh] ?? []), "DH"];
    return out;
  }, [vestRequired, events, nextPeriod]);
  // The chip's line: who wears each vest next period, first names; a vest
  // with no wearer, or a planned wearer who isn't on the field, needs a pick.
  function vestSummary(): { summary: string; attention: boolean } {
    const v = currentVests(events, nextPeriod);
    const reqs = ageGroup.vestRequirements;
    const parts: string[] = [];
    let attention = false;
    for (const [key, label, need] of [["fr", "FR", reqs?.fr], ["dh", "DH", reqs?.dh]] as const) {
      if (!need) continue;
      const id = v[key];
      const kid = id ? playerById.get(id) : null;
      const name = kid ? squadNames.first(kid) : null;
      if (!id || !name || !onFieldNow.includes(id)) {
        attention = true;
        parts.push(`${label} to pick`);
      } else parts.push(`${label} ${name}`);
    }
    return { summary: parts.join(" · "), attention };
  }
  const placed = new Set(inGame);
  const canPlay = squad.filter((p) => !sidelinedSet.has(p.id));
  const onFieldNow = [...draft.forwards, ...draft.backs].filter((id) => !sidelinedSet.has(id));
  const benchNow = draft.bench.filter((id) => !sidelinedSet.has(id));

  return (
    <PeriodBreak
      header={{ exitHref, game, onHelp }}
      config={config}
      nextPeriod={nextPeriod}
      slots={board}
      players={players}
      previous={previous}
      gameMs={msByPlayer}
      scores={scores}
      tags={tags}
      positions={leaguePlaybook?.positions?.length ? positionLabels : undefined}
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
        scoreEditor
          ? {
              line: config.formatScore({ us: {}, them: {}, points: { us: state.teamScore.points, them: state.opponentScore.points } }),
              editor: scoreEditor,
            }
          : undefined
      }
      settings={{
        injured: {
          players: squad.filter((p) => injured.has(p.id)).map(asBreakPlayer),
          candidates: canPlay.map(asBreakPlayer),
          onToggle: setInjured,
        },
        lent: {
          players: squad.filter((p) => loaned.has(p.id) && !injured.has(p.id)).map(asBreakPlayer),
          candidates: canPlay.map(asBreakPlayer),
          onToggle: setLent,
        },
        arrived: isAdmin ? { candidates: squad.filter((p) => !placed.has(p.id)).map(asBreakPlayer), onAdd: addArrived } : undefined,
        markOut: isAdmin
          ? {
              candidates: onFieldNow.map((id) => playerById.get(id)).filter((p): p is Player => !!p).map(asBreakPlayer),
              replacements: benchNow
                .map((id) => playerById.get(id))
                .filter((p): p is Player => !!p)
                .map<InjuryReplacementCandidate>((p) => ({ player: p, totalMs: msByPlayer[p.id] ?? 0 }))
                .sort((a, b) => a.totalMs - b.totalMs),
              spotLabel: (pid) =>
                draft.forwards.includes(pid) ? "Forward" : draft.backs.includes(pid) ? "Back" : null,
              player: (pid) => playerById.get(pid),
              onOut: markOut,
            }
          : undefined,
        pending,
        error,
      }}
      banner={
        seeded ? (
          <p
            data-testid="planned-seed-banner"
            className="text-center font-mono text-[10px] font-bold uppercase tracking-micro text-brand-700"
          >
            Pre-filled from your planned {periodWord} {nextPeriod} lineup
          </p>
        ) : undefined
      }
      statusChip={
        vestRequired
          ? {
              title: "Vests",
              ...vestSummary(),
              sheet: (
                <VestAssignmentCard
                  auth={auth}
                  sport={sport}
                  gameId={game.id}
                  squad={squad}
                  onFieldPlayerIds={onFieldNow}
                  events={events}
                  ageGroup={ageGroup}
                  period={nextPeriod}
                  bare
                />
              ),
            }
          : undefined
      }
      start={{ onStart: () => void start(), pending, cue: getSportConfig(sport).words.startCue, error }}
    />
  );
}
