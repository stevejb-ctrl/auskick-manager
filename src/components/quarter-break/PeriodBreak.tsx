"use client";

// ─── The period break screen ─────────────────────────────────
// One screen for every sport's quarter- or half-time break (docs/
// handoffs/siren-footy-break-redesign-HANDOFF.md): the header, a score
// chip and a status chip, the 4-up strategy picker, the issues card, the
// next period's lineup on the sport's own field, drawn as its live
// screen draws it (FieldLines: the surface, markings and lines; Steve,
// 10 Nov 2026), the zones from the sport's config (lib/sports/break.ts)
// as its lines, the bench under it (KidBench), and the sticky Start
// footer. Tap two tiles to swap them, across lines or with the bench.
//
// It never asks which sport it's showing. Each sport's adapter (AFL's
// QuarterBreak, NetballQuarterBreak, SoccerBreak, BasketballBreak,
// LeagueBreak) turns its engine into these props: the slots, the rule
// check, the strategies, its writers. What differs between sports lives
// in config or in the adapter, never in a branch here: the field too,
// whose surface, markings and line shapes each adapter takes from the
// helper its live screen uses (ovalField, netballCourt, …), so the two
// can't drift apart.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LiveTopBar } from "@/components/live/LiveTopBar";
import { lostScoreText, takeLostScore } from "@/lib/live/lostScore";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import { QuarterKickoffBar } from "@/components/quarter-break/QuarterKickoffBar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Modal } from "@/components/ui/Modal";
import { SFButton } from "@/components/sf";
import { BreakPlayerTile, type BreakTileModel } from "@/components/quarter-break/BreakPlayerTile";
import { BreakIssuesCard } from "@/components/quarter-break/BreakIssuesCard";
import {
  BreakSettingsSheet,
  type BreakPlayer,
  type BreakSettingsProps,
} from "@/components/quarter-break/BreakSettingsSheet";
import { FieldLines, type FieldLine, type FieldLinesProps } from "@/components/live/FieldLines";
import { KidBench } from "@/components/live/KidBench";
import { LentList } from "@/components/lineup/LentList";
import { useSquadNames } from "@/components/live/SquadNames";
import {
  BENCH,
  averageMs,
  canSwap,
  isLowTime,
  movementText,
  placeIndex,
  type BoardSlot,
} from "@/lib/live/break/board";
import type { BreakIssues } from "@/lib/live/break/issues";
import { kidsMoved, marginWords, replanUndoneText, replannedText } from "@/lib/live/break/breakWords";
import type { BreakScoreLine, SportBreakConfig } from "@/lib/sports/break";
import type { BreakZoneDef } from "@/lib/sports/types";
import type { Game, MixedGroup } from "@/lib/types";
import { announce } from "@/lib/a11y/announce";

export type { BreakPlayer } from "@/components/quarter-break/BreakSettingsSheet";

/** How the next lineup starts: the strategy picker's four options. */
export type BreakStrategy = "suggested" | "rotate" | "repeat" | "manual";

const STRATEGIES: { id: BreakStrategy; label: string }[] = [
  { id: "suggested", label: "Suggested" },
  { id: "rotate", label: "Rotate" },
  { id: "repeat", label: "Repeat" },
  { id: "manual", label: "Manual" },
];

/** A spot on the break's field: its slot and the tile drawn for it. */
export interface BreakFieldCell {
  slot: BoardSlot;
  node: ReactNode;
}

/** How a line's kids stand, where it isn't a plain grid (FieldLine). */
export type BreakLineShape = Partial<Pick<FieldLine, "rows" | "rowsAlign" | "rowSide" | "cols">>;

/**
 * The sport's field at the break, the same as its live screen's: the
 * surface and markings (and the room each end keeps, the tile width),
 * from the helper the live screen uses, and how each zone's kids stand
 * (netball's zigzag, rugby's formation, Oztag's 3-2-3).
 */
export interface BreakField extends Pick<FieldLinesProps, "surface" | "marks" | "endsPx" | "tileWidth" | "dense"> {
  shape?: (zone: BreakZoneDef, cells: BreakFieldCell[]) => BreakLineShape | undefined;
}

export interface PeriodBreakProps {
  /** The live screen's top bar: Exit, the title and Help. */
  header: { exitHref?: string; game: Game; onHelp?: () => void };
  config: SportBreakConfig;
  /** The sport's field, as its live screen draws it. */
  field: BreakField;
  /** The period about to start (1-based). */
  nextPeriod: number;
  /** The staged lineup as slots (lib/live/break/board.ts). */
  slots: readonly BoardSlot[];
  players: ReadonlyMap<string, BreakPlayer>;
  /** Where each kid ended last period: their group, or "bench". */
  previous: Readonly<Record<string, string>>;
  /** Game time so far, ms. */
  gameMs: Readonly<Record<string, number>>;
  /** Scores this game, for kids who've scored. */
  scores?: Readonly<Record<string, { text: string; label: string }>>;
  /** Small notes per kid (fouls, a vest). */
  tags?: Readonly<Record<string, string[]>>;
  /**
   * Named positions (rugby): each kid's position label, shown as the
   * tile's tag in the zone's colour, as a netball bib is.
   */
  positions?: Readonly<Record<string, string>>;
  /** Named positions: the position each kid held last period, for "From BF6". */
  previousPositions?: Readonly<Record<string, string>>;
  /** Kids who can't play, and why: "Injured", "Lent", "Fouled out". */
  sidelined: Readonly<Record<string, string>>;
  /**
   * A mixed team's G or B per kid (MixedMark), coach view only: the
   * sport passes it on a mixed team, to a coach, for kids whose
   * Girl/Boy is set.
   */
  groups?: Readonly<Record<string, MixedGroup>>;
  onSwap: (a: BoardSlot, b: BoardSlot) => void;
  onLongPress?: (playerId: string) => void;
  strategy: BreakStrategy;
  onStrategy: (next: BreakStrategy) => void;
  /**
   * How many times the break has re-planned its lineup on its own
   * (useBreakReplan: who can play changed). Each new one is said under
   * the strategy picker, "Lineup re-planned: 3 kids moved." (Stagehand
   * round 11, #2), until the coach next changes the lineup themselves.
   */
  replanned?: number;
  /**
   * Put back the lineup from before the re-plan (useBreakReplan's
   * `undo`): an Undo beside the line, while there's one to put back.
   */
  onUndoReplan?: () => void;
  issues: BreakIssues;
  /** The score chip; absent when the team isn't keeping score. */
  score?: { line: BreakScoreLine; editor?: ReactNode };
  settings: BreakSettingsProps;
  /** A line under the hint ("Pre-filled from your planned Q3 lineup"). */
  banner?: ReactNode;
  /** Sport extras after the bench. */
  extras?: ReactNode;
  /**
   * A sport's own status chip under the score and game settings (league's
   * vests: "FR Kira · DH Maya"), opening a bottom sheet with its picker,
   * as game settings does.
   */
  statusChip?: {
    /** The chip's eyebrow, e.g. "Vests". */
    title: string;
    /** What's set, e.g. "FR Kira · DH Maya". */
    summary: string;
    /** Something needs a pick: the chip turns amber. */
    attention?: boolean;
    /** The sheet's content. */
    sheet: ReactNode;
  };
  start: {
    onStart: () => void;
    pending?: boolean;
    disabled?: boolean;
    /** "siren goes", "umpire calls play", "whistle goes". */
    cue: string;
    error?: string | null;
  };
  /** Sport overlays (the long-press player sheet). */
  children?: ReactNode;
}

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** "1 injured", "2 injured · 1 lent", or "All available". */
function statusSummary(sidelined: Readonly<Record<string, string>>): string {
  const counts = new Map<string, number>();
  for (const why of Object.values(sidelined)) counts.set(why.toLowerCase(), (counts.get(why.toLowerCase()) ?? 0) + 1);
  if (counts.size === 0) return "All available";
  return Array.from(counts.entries())
    .map(([why, n]) => `${n} ${why}`)
    .join(" · ");
}

export function PeriodBreak(props: PeriodBreakProps) {
  const { config, nextPeriod, slots, players, previous, gameMs, sidelined, issues, start } = props;
  // The selected slot, by who's in it (or which empty spot it is), not by
  // index: the slots re-sort when a kid is lent or hurt, and an index
  // would then point at someone else.
  const [picked, setPicked] = useState<BoardSlot | null>(null);
  const selectedIndex = useMemo(() => {
    if (!picked) return -1;
    return slots.findIndex((s) =>
      picked.playerId ? s.playerId === picked.playerId : !s.playerId && s.group === picked.group && s.index === picked.index,
    );
  }, [picked, slots]);
  const selected = selectedIndex >= 0 ? selectedIndex : null;
  const setSelected = (i: number | null) => setPicked(i === null ? null : slots[i] ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [chipOpen, setChipOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // The break opens at the top: the score, the strategy picker and the
  // first zones. It replaces the live view, which was often scrolled
  // down the field, and the page kept that offset (AFL audit, 23 Oct
  // 2026: scrollY 179 hid the score and the picker). Every scrolled
  // ancestor too: the /run demo's DeviceFrame scrolls itself.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let el = rootRef.current?.parentElement ?? null;
    while (el) {
      if (el.scrollTop > 0) el.scrollTop = 0;
      el = el.parentElement;
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [nextPeriod]);

  const squadNames = useSquadNames();
  const sidelinedSet = useMemo(() => new Set(Object.keys(sidelined)), [sidelined]);
  const places = useMemo(() => placeIndex(config.zones), [config.zones]);
  const periodName = config.periodName(nextPeriod);

  // The break is said, and its heading takes focus, as it replaces the
  // live screen (UX round 3, e4: a quarter running out said nothing and
  // focus fell to BODY). Once per break.
  const scoreLine = props.score?.line.main ?? null;
  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
    const said = [config.breakName(nextPeriod - 1), `${periodName} lineup`];
    if (scoreLine) said.push(`Score ${scoreLine.replace(/\s*–\s*/, " to ")}`);
    announce(said.join(". "), { priority: 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- said once, as the break opens
  }, [nextPeriod]);

  // A selection that no longer points at a swappable kid (they left the
  // board, or were lent or hurt) is dropped: the next tap would swap them on.
  const selectedSlot = selected !== null ? slots[selected] : undefined;
  useEffect(() => {
    if (!picked) return;
    if (selectedIndex < 0 || (picked.playerId && sidelinedSet.has(picked.playerId))) setPicked(null);
  }, [picked, selectedIndex, sidelinedSet]);

  // A start that failed comes back to the lineup with its error showing.
  useEffect(() => {
    if (start.error) setConfirmOpen(false);
  }, [start.error]);

  // The break re-planned on its own: say so, with how many kids moved,
  // against the lineup on screen the render before.
  const [replanNote, setReplanNote] = useState<string | null>(null);
  const placedBefore = useRef<Record<string, string>>({});
  const replanSeen = useRef(props.replanned ?? 0);
  useEffect(() => {
    const placed: Record<string, string> = {};
    for (const s of slots) if (s.playerId) placed[s.playerId] = s.zone === BENCH ? BENCH : s.group;
    const stamp = props.replanned ?? 0;
    if (stamp !== replanSeen.current) {
      replanSeen.current = stamp;
      const moved = kidsMoved(placedBefore.current, placed, BENCH, sidelinedSet);
      // A re-plan that moved nobody leaves the line (and its Undo) as it was.
      if (moved > 0) setReplanNote(replannedText(moved));
    }
    placedBefore.current = placed;
  }, [slots, props.replanned, sidelinedSet]);
  useEffect(() => setReplanNote(null), [nextPeriod]);
  // Undo: the lineup goes back and the line says so, with focus on it
  // (the button that had it goes).
  const replanLineRef = useRef<HTMLParagraphElement>(null);
  function undoReplan() {
    props.onUndoReplan?.();
    setReplanNote(replanUndoneText);
    requestAnimationFrame(() => replanLineRef.current?.focus({ preventScroll: true }));
  }

  const average = useMemo(() => {
    const healthy = slots.map((s) => s.playerId).filter((id): id is string => !!id && !sidelinedSet.has(id));
    return averageMs(healthy, gameMs);
  }, [slots, sidelinedSet, gameMs]);

  function tileFor(slot: BoardSlot): BreakTileModel {
    const zone = config.zones.find((z) => z.key === slot.zone);
    const id = slot.playerId;
    if (!id) {
      return {
        playerId: null,
        tag: slot.label ?? "",
        tagIsBib: !!slot.label,
        name: "",
        movement: "",
        time: "",
        lowTime: false,
        sidelined: false,
        emptyLabel: slot.label ?? zone?.short.toUpperCase(),
      };
    }
    const p = players.get(id);
    const why = sidelined[id];
    const prev = previous[id] ?? BENCH;
    const ms = gameMs[id] ?? 0;
    const jersey = config.showJumperNumbers && p?.jerseyNumber != null && p.jerseyNumber !== "" ? `#${p.jerseyNumber}` : "";
    const bib = slot.label ?? (slot.zone !== BENCH ? props.positions?.[id] : undefined);
    return {
      playerId: id,
      tag: bib ?? jersey,
      tagIsBib: !!bib,
      name: p?.name ?? "Player",
      shown: p ? squadNames.tile({ id, full_name: p.name }) : undefined,
      score: props.scores?.[id],
      tags: props.tags?.[id],
      group: props.groups?.[id],
      movement:
        why ??
        movementText(prev, slot.group, places, props.positions ? { from: props.previousPositions?.[id], to: bib } : undefined),
      time: clock(ms),
      lowTime: !why && isLowTime(ms, average, config.lowTimeMs),
      sidelined: !!why,
    };
  }

  function tap(index: number) {
    const slot = slots[index];
    if (slot.playerId && sidelinedSet.has(slot.playerId)) return;
    if (selected === null || !selectedSlot) {
      setSelected(index);
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }
    if (!canSwap(selectedSlot, slot, sidelinedSet)) {
      // Two bench kids, or two empty spots: start again from this one.
      setSelected(index);
      return;
    }
    props.onSwap(selectedSlot, slot);
    setSelected(null);
    setReplanNote(null);
  }

  function fix(issueId: string) {
    const swaps = issues.broken.find((i) => i.id === issueId)?.fix;
    if (!swaps) return;
    // Each swap is against the lineup the one before it left; adapters
    // apply swaps to the latest draft, so they compose in order.
    for (const [a, b] of swaps) props.onSwap(a, b);
    setSelected(null);
    setReplanNote(null);
  }

  // One tile, on the field or the bench, keyed by its spot (and kid).
  function tileNode(s: BoardSlot, i: number, place: "field" | "bench"): ReactNode {
    return (
      <div key={`${s.group}-${s.index}-${s.playerId ?? "empty"}`} className="min-w-0">
        <BreakPlayerTile
          tile={tileFor(s)}
          place={place}
          dense={place === "field" && field.dense}
          testId={s.playerId ? `player-tile-${s.playerId}` : undefined}
          selected={selected === i}
          target={selected !== null && selected !== i && !!selectedSlot && canSwap(selectedSlot, s, sidelinedSet)}
          onTap={() => tap(i)}
          onLongPress={props.onLongPress && s.playerId ? () => props.onLongPress?.(s.playerId as string) : undefined}
        />
      </div>
    );
  }

  // The field: a line per zone, attack up the page, each in the shape
  // the sport's live screen gives it. A line says how many are on
  // ("FORWARD 4 on"), underlined when it's short.
  const { field } = props;
  const fieldLines: FieldLine[] = config.zones.flatMap((zone) => {
    const cells = slots.flatMap((s, i) => (s.zone === zone.key ? [{ slot: s, node: tileNode(s, i, "field") }] : []));
    if (cells.length === 0) return [];
    const on = cells.filter((c) => c.slot.playerId && !sidelined[c.slot.playerId]).length;
    return [
      {
        key: zone.key,
        label: titleCase(zone.label),
        tiles: cells.map((c) => c.node),
        count: { text: `${on} on`, short: on < zone.slots },
        ...field.shape?.(zone, cells),
      },
    ];
  });

  // The bench: who can come on, then who's out, as in play (KidBench).
  const benchCells = slots.map((s, i) => ({ s, i })).filter(({ s }) => s.zone === BENCH);
  const benchOut = new Map<string, number>();
  for (const { s } of benchCells) {
    const why = s.playerId ? sidelined[s.playerId] : undefined;
    if (why) benchOut.set(why.toLowerCase(), (benchOut.get(why.toLowerCase()) ?? 0) + 1);
  }
  const benchOutCount = Array.from(benchOut.values()).reduce((a, b) => a + b, 0);
  const benchCount = [String(benchCells.length - benchOutCount), ...Array.from(benchOut.entries()).map(([why, n]) => `${n} ${why}`)].join(" + ");

  const lentKids = props.settings.lent?.players ?? [];
  const brokenCount = issues.broken.length;
  const selectedName = selectedSlot?.playerId ? players.get(selectedSlot.playerId)?.name ?? "Player" : null;
  const selectedEmpty = selectedSlot && !selectedSlot.playerId ? selectedSlot.label ?? config.zones.find((z) => z.key === selectedSlot.zone)?.short : null;

  // A score the other phone's period end cut off (lib/live/lostScore).
  const [lostScore, setLostScore] = useState<string | null>(null);
  useEffect(() => setLostScore(takeLostScore()), []);

  return (
    <div ref={rootRef} className="pb-40">
      {props.header.exitHref ? (
        <LiveTopBar
          exitHref={props.header.exitHref}
          game={props.header.game}
          isLive
          onHelp={props.header.onHelp}
          title={`${periodName} lineup`}
          subtitle={`${config.breakName(nextPeriod - 1)} · vs ${props.header.game.opponent}`}
          feedback={false}
        />
      ) : (
        <div className="px-1 py-2 text-center">
          <h1 tabIndex={-1} className="text-[1.0625rem] font-bold text-ink outline-none">
            {periodName} lineup
          </h1>
          <p className="text-xs text-ink-dim">
            {config.breakName(nextPeriod - 1)} · vs {props.header.game.opponent}
          </p>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {/* The period's over, said plainly, in every sport: at the hooter
            nine of them turned into this screen without a word, and a
            parent running the game didn't know the quarter had ended or
            what to do (Stagehand round 8, #8). AFL's end-of-quarter modal
            comes first there; this is the same line once it's gone. */}
        {nextPeriod > 1 && (
          <div data-testid="period-over" role="status" className="rounded-md border border-hairline bg-surface px-4 py-3 shadow-card">
            <p className="text-base font-bold text-ink">{config.periodName(nextPeriod - 1)} is over</p>
            <p className="mt-0.5 text-sm text-ink-dim">
              Check the {periodName} lineup below, then tap Start {periodName}.
            </p>
          </div>
        )}
        {lostScore && (
          <div data-testid="lost-score-notice">
            <InlineAlert kind="warn">{lostScoreText(lostScore)}</InlineAlert>
          </div>
        )}
        {/* Context row: the score and who's out. */}
        <div className="flex items-center gap-2">
          {props.score && (
            <button
              type="button"
              onClick={() => setScoreOpen(true)}
              disabled={!props.score.editor}
              aria-label={`Score ${props.score.line.main}, ${marginWords(props.score.line.margin).toLowerCase()}. Review and update scores`}
              className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[12px] border border-hairline bg-surface px-3 text-left disabled:cursor-default"
            >
              <span className="whitespace-nowrap font-mono text-[0.9375rem] font-semibold tabular-nums text-ink">
                {props.score.line.main}
              </span>
              {/* The margin, said: "Up by 1", not "+1" (Stagehand round 11, #3). */}
              <span
                data-testid="break-margin"
                // win green, not ok: ok is 4.05:1 on white (UX round 3, e4).
                className={`whitespace-nowrap text-[0.8125rem] font-semibold ${
                  props.score.line.margin > 0 ? "text-win" : props.score.line.margin < 0 ? "text-danger" : "text-ink-dim"
                }`}
              >
                {marginWords(props.score.line.margin)}
              </span>
              <span className="ml-auto truncate text-xs text-ink-dim">{props.score.line.detail}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={`Game settings: ${statusSummary(sidelined)}`}
            className={`flex h-11 items-center gap-1.5 rounded-[12px] border border-hairline bg-surface px-3 text-sm font-medium text-ink ${props.score ? "shrink-0" : "flex-1 justify-center"}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="text-ink-dim">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="whitespace-nowrap">{statusSummary(sidelined)}</span>
          </button>
        </div>

        {props.statusChip && (
          <button
            type="button"
            onClick={() => setChipOpen(true)}
            aria-label={`${props.statusChip.title}: ${props.statusChip.summary}`}
            className={`flex h-11 w-full items-center gap-2 rounded-[12px] border px-3 text-left text-sm ${
              props.statusChip.attention ? "border-due/50 bg-due-tint" : "border-hairline bg-surface"
            }`}
          >
            <span className="font-mono text-micro font-bold uppercase tracking-micro text-ink-dim">{props.statusChip.title}</span>
            <span className={`min-w-0 flex-1 truncate font-medium ${props.statusChip.attention ? "text-due" : "text-ink"}`}>
              {props.statusChip.summary}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-ink-dim">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        <SegmentedControl
          compact
          label="How the next lineup is built"
          options={STRATEGIES}
          value={props.strategy}
          onChange={(next) => {
            setSelected(null);
            setReplanNote(null);
            props.onStrategy(next);
          }}
        />

        {replanNote && (
          <div className="flex items-center gap-2 rounded-md border border-hairline bg-surface-alt py-0.5 pl-3 pr-1">
            <p
              ref={replanLineRef}
              tabIndex={-1}
              data-testid="break-replanned"
              role="status"
              className="min-w-0 flex-1 py-1.5 text-sm font-medium text-ink outline-none"
            >
              {replanNote}
            </p>
            {/* Put back the lineup from before (Steve, 12 Nov 2026). */}
            {props.onUndoReplan && replanNote !== replanUndoneText && (
              <button
                type="button"
                data-testid="break-replan-undo"
                onClick={undoReplan}
                aria-label="Undo the re-plan"
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md px-3 text-sm font-semibold text-ink underline underline-offset-2 hover:bg-ink/5 active:bg-ink/10"
              >
                Undo
              </button>
            )}
          </div>
        )}

        <BreakIssuesCard issues={issues} onFix={fix} />

        {/* Kids lent to the other team, each with a plain Bring back:
            getting one back at the break was only in Game settings, as
            a ×, and four coaches in Stagehand round 9 didn't find it.
            Every sport hands over its lent kids with their writer. */}
        <LentList
          testId="break-lent"
          players={lentKids}
          note={`Bring them back and they join the bench for ${periodName}.`}
          pending={props.settings.pending}
          buttonTestId={(id) => `break-bring-back-${id}`}
          onBringBack={(id) => props.settings.lent?.onToggle(id, false)}
        />

        <p className="text-center text-xs text-ink-dim">Tap two players to swap — any position or bench</p>
        {props.banner}

        {/* The field, drawn as in play, and the bench under it. */}
        <div data-testid="break-field" className="flex flex-col">
          <FieldLines
            lines={fieldLines}
            surface={field.surface}
            marks={field.marks}
            endsPx={field.endsPx}
            tileWidth={field.tileWidth}
            dense={field.dense}
          />
        </div>
        {benchCells.length > 0 && (
          <KidBench count={benchCount} tiles={benchCells.map(({ s, i }) => tileNode(s, i, "bench"))} />
        )}

        {props.extras}

        {start.error && <InlineAlert>{start.error}</InlineAlert>}
      </div>

      <QuarterKickoffBar
        onConfirm={() => setConfirmOpen(true)}
        confirmLabel={`Start ${periodName}`}
        disabled={start.disabled || start.pending}
        loading={start.pending}
        badge={
          brokenCount > 0 ? (
            <span className="rounded-full bg-alarm-soft px-2 py-0.5 text-xs font-semibold text-danger">
              {brokenCount} rule{brokenCount === 1 ? "" : "s"}
            </span>
          ) : undefined
        }
        prompt={
          selectedSlot ? (
            <div className="flex items-center gap-2 text-[0.8125rem] text-ink" aria-live="polite">
              <span className="min-w-0 truncate">
                {selectedName ? (
                  <>
                    Swap <b>{selectedName}</b> with…
                  </>
                ) : (
                  <>
                    Fill the empty <b>{selectedEmpty}</b> spot with…
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="ml-auto h-9 shrink-0 rounded-lg border border-hairline bg-surface px-3 text-[0.8125rem] font-medium text-ink"
              >
                Cancel
              </button>
            </div>
          ) : undefined
        }
      />

      {confirmOpen && (
        <StartQuarterModal
          quarter={nextPeriod}
          periodName={periodName}
          cue={start.cue}
          sheet
          loading={start.pending}
          brokenRules={issues.broken.map((i) => i.message)}
          onStart={() => {
            start.onStart();
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      {settingsOpen && <BreakSettingsSheet {...props.settings} onClose={() => setSettingsOpen(false)} />}

      {chipOpen && props.statusChip && (
        <Modal placement="sheet" size="md" label={props.statusChip.title} onClose={() => setChipOpen(false)}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">{props.statusChip.title}</h2>
            <SFButton variant="ghost" size="sm" onClick={() => setChipOpen(false)}>
              Done
            </SFButton>
          </div>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">{props.statusChip.sheet}</div>
        </Modal>
      )}

      {scoreOpen && props.score?.editor && (
        <Modal placement="sheet" size="md" label="Score" onClose={() => setScoreOpen(false)}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">Score</h2>
            <SFButton variant="ghost" size="sm" onClick={() => setScoreOpen(false)}>
              Done
            </SFButton>
          </div>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">{props.score.editor}</div>
        </Modal>
      )}

      {props.children}
    </div>
  );
}
