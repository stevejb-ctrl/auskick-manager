"use client";

// ─── The period break screen ─────────────────────────────────
// One screen for every sport's quarter- or half-time break (docs/
// handoffs/siren-footy-break-redesign-HANDOFF.md): the header, a score
// chip and a status chip, the 4-up strategy picker, the issues card, the
// zones from the sport's config (lib/sports/break.ts) as 2-column tiles
// with the bench last, and the sticky Start footer. Tap two tiles to
// swap them, across zones or with the bench.
//
// It never asks which sport it's showing. Each sport's adapter (AFL's
// QuarterBreak, NetballQuarterBreak, SoccerBreak, BasketballBreak,
// LeagueBreak) turns its engine into these props: the slots, the rule
// check, the strategies, its writers. What differs between sports lives
// in config or in the adapter, never in a branch here.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LiveTopBar } from "@/components/live/LiveTopBar";
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
import { ZONE_SWATCH, ZONE_TEXT } from "@/components/quarter-break/breakZoneTokens";
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
import type { BreakScoreLine, SportBreakConfig } from "@/lib/sports/break";
import type { Game } from "@/lib/types";

export type { BreakPlayer } from "@/components/quarter-break/BreakSettingsSheet";

/** How the next lineup starts: the strategy picker's four options. */
export type BreakStrategy = "suggested" | "rotate" | "repeat" | "manual";

const STRATEGIES: { id: BreakStrategy; label: string }[] = [
  { id: "suggested", label: "Suggested" },
  { id: "rotate", label: "Rotate" },
  { id: "repeat", label: "Repeat" },
  { id: "manual", label: "Manual" },
];

export interface PeriodBreakProps {
  /** The live screen's top bar: Exit, the title and Help. */
  header: { exitHref?: string; game: Game; onHelp?: () => void };
  config: SportBreakConfig;
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
  onSwap: (a: BoardSlot, b: BoardSlot) => void;
  onLongPress?: (playerId: string) => void;
  strategy: BreakStrategy;
  onStrategy: (next: BreakStrategy) => void;
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

  const sidelinedSet = useMemo(() => new Set(Object.keys(sidelined)), [sidelined]);
  const places = useMemo(() => placeIndex(config.zones), [config.zones]);
  const periodName = config.periodName(nextPeriod);

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

  const average = useMemo(() => {
    const healthy = slots.map((s) => s.playerId).filter((id): id is string => !!id && !sidelinedSet.has(id));
    return averageMs(healthy, gameMs);
  }, [slots, sidelinedSet, gameMs]);

  function tileFor(slot: BoardSlot): BreakTileModel {
    const zone = config.zones.find((z) => z.key === slot.zone);
    const color = zone?.color ?? "bench";
    const id = slot.playerId;
    if (!id) {
      return {
        playerId: null,
        tag: slot.label ?? "",
        tagIsBib: !!slot.label,
        zoneColor: color,
        name: "",
        movement: "",
        fromColor: "bench",
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
      zoneColor: color,
      name: p?.name ?? "Player",
      score: props.scores?.[id],
      tags: props.tags?.[id],
      movement:
        why ??
        movementText(prev, slot.group, places, props.positions ? { from: props.previousPositions?.[id], to: bib } : undefined),
      fromColor: places[prev]?.color ?? "bench",
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
  }

  function fix(issueId: string) {
    const swaps = issues.broken.find((i) => i.id === issueId)?.fix;
    if (!swaps) return;
    // Each swap is against the lineup the one before it left; adapters
    // apply swaps to the latest draft, so they compose in order.
    for (const [a, b] of swaps) props.onSwap(a, b);
    setSelected(null);
  }

  const sections = [
    ...config.zones.map((z) => ({ key: z.key, label: z.label, color: z.color as keyof typeof ZONE_SWATCH })),
    { key: BENCH, label: "BENCH", color: "bench" as const },
  ];

  const brokenCount = issues.broken.length;
  const selectedName = selectedSlot?.playerId ? players.get(selectedSlot.playerId)?.name ?? "Player" : null;
  const selectedEmpty = selectedSlot && !selectedSlot.playerId ? selectedSlot.label ?? config.zones.find((z) => z.key === selectedSlot.zone)?.short : null;

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
          <h1 className="text-[17px] font-bold text-ink">{periodName} lineup</h1>
          <p className="text-xs text-ink-dim">
            {config.breakName(nextPeriod - 1)} · vs {props.header.game.opponent}
          </p>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {/* Context row: the score and who's out. */}
        <div className="flex items-center gap-2">
          {props.score && (
            <button
              type="button"
              onClick={() => setScoreOpen(true)}
              disabled={!props.score.editor}
              aria-label={`Score ${props.score.line.main}. Review and update scores`}
              className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[12px] border border-hairline bg-surface px-3 text-left disabled:cursor-default"
            >
              <span className="whitespace-nowrap font-mono text-[15px] font-semibold tabular-nums text-ink">
                {props.score.line.main}
              </span>
              {props.score.line.margin !== 0 && (
                <span
                  className={`whitespace-nowrap text-[13px] font-semibold ${props.score.line.margin > 0 ? "text-ok" : "text-danger"}`}
                >
                  {props.score.line.margin > 0 ? `+${props.score.line.margin}` : props.score.line.margin}
                </span>
              )}
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
            <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">{props.statusChip.title}</span>
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
            props.onStrategy(next);
          }}
        />

        <BreakIssuesCard issues={issues} onFix={fix} />

        <p className="text-center text-xs text-ink-dim">Tap two players to swap — any position or bench</p>
        {props.banner}

        {sections.map((section) => {
          const inSection = slots.map((s, i) => ({ s, i })).filter(({ s }) => s.zone === section.key);
          if (section.key === BENCH && inSection.length === 0) return null;
          const out = inSection.filter(({ s }) => s.playerId && sidelined[s.playerId]);
          const outCounts = new Map<string, number>();
          for (const { s } of out) {
            const why = sidelined[s.playerId as string].toLowerCase();
            outCounts.set(why, (outCounts.get(why) ?? 0) + 1);
          }
          const count =
            section.key === BENCH
              ? [String(inSection.length - out.length), ...Array.from(outCounts.entries()).map(([why, n]) => `${n} ${why}`)].join(" + ")
              : `${inSection.filter(({ s }) => s.playerId).length} on`;
          return (
            <section key={section.key} role="group" aria-label={titleCase(section.label)} className="space-y-1.5">
              <div className="flex items-center gap-2 px-0.5">
                <span aria-hidden className={`h-2.5 w-2.5 rounded-[3px] ${ZONE_SWATCH[section.color]}`} />
                <span className={`font-mono text-xs font-semibold tracking-[0.12em] ${ZONE_TEXT[section.color]}`}>
                  {section.label}
                </span>
                <span className="ml-auto text-xs text-ink-dim">{count}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {inSection.map(({ s, i }) => {
                  const tile = tileFor(s);
                  return (
                    <BreakPlayerTile
                      key={`${s.group}-${s.index}-${s.playerId ?? "empty"}`}
                      tile={tile}
                      testId={s.playerId ? `player-tile-${s.playerId}` : undefined}
                      selected={selected === i}
                      target={selected !== null && selected !== i && !!selectedSlot && canSwap(selectedSlot, s, sidelinedSet)}
                      onTap={() => tap(i)}
                      onLongPress={props.onLongPress && s.playerId ? () => props.onLongPress?.(s.playerId as string) : undefined}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}

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
            <div className="flex items-center gap-2 text-[13px] text-ink" aria-live="polite">
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
                className="ml-auto h-9 shrink-0 rounded-lg border border-hairline bg-surface px-3 text-[13px] font-medium text-ink"
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
