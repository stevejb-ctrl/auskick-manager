// Fixing a finished game's scores. Round 3 edge testing (24 Oct 2026):
// the game page's More promised "Open game screen: fix scores", which
// opened a read-only summary; the only edit was Restart, which wipes the
// game. A coach can now add a missed score, take off a wrong one, or say
// who really scored, for every sport.
//
// Each fix is written as events, never an edit: a score_undo naming the
// score, and the score itself (marked retro, with its period), so every
// replay (the summary, the scorers card, Stats) recomputes from the log
// as it does for a live undo.

import { getSportConfig } from "@/lib/sports";
import { pairScoreUndos } from "@/lib/live/scoreUndo";
import type { GameEvent, Sport } from "@/lib/types";

export interface ScoreKind {
  /** The sport config's id ("conversion"). */
  id: string;
  /** The event written ("conversion_attempt" for a conversion). */
  type: string;
  label: string;
  /** The scorebug's chip ("G", "+3", "T"). */
  short: string;
  side: "us" | "them";
  points: number;
  /** Ours, scored by a kid: the fix asks who. */
  scorer: boolean;
  /** Written with the event (a conversion is a made attempt). */
  metadata?: Record<string, unknown>;
}

const OPPONENT = /^(opponent|opp\.)\s+/i;

/**
 * The sport's scores, ours then theirs, as the fix offers them. Rugby's
 * penalty and field (drop) goals only where the grade kicks for goal;
 * Oztag's girl's try only on a mixed team.
 */
export function scoreKinds(sport: Sport, opts: { goalsFromPlay?: boolean; girlsTry?: boolean } = {}): ScoreKind[] {
  const goalsFromPlay = opts.goalsFromPlay ?? true;
  return getSportConfig(sport)
    .scoreTypes.filter((t) => goalsFromPlay || !/(penalty_goal|field_goal)$/.test(t.id))
    .filter((t) => opts.girlsTry || !/girls_try$/.test(t.id))
    .map((t) => {
      const conversion = t.id === "conversion";
      const label = t.label.replace(OPPONENT, "");
      return {
        id: t.id,
        type: conversion ? "conversion_attempt" : t.id,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        short: t.shortLabel,
        side: t.opponent ? ("them" as const) : ("us" as const),
        points: t.points,
        scorer: !t.opponent,
        ...(conversion ? { metadata: { made: true } } : {}),
      };
    });
}

/** Every event type that's a score in this sport (missed kicks included, as the replays pair undos). */
function scoreEventTypes(sport: Sport): Set<string> {
  return new Set(scoreKinds(sport, { goalsFromPlay: true, girlsTry: true }).map((k) => k.type));
}

export interface FinishedScoreRow {
  id: string;
  type: string;
  kind: ScoreKind;
  side: "us" | "them";
  playerId: string | null;
  period: number;
}

/** The scores still standing, in order, each with the period it counts in. */
export function finishedScoreLog(sport: Sport, events: GameEvent[]): FinishedScoreRow[] {
  const kinds = new Map(scoreKinds(sport, { goalsFromPlay: true, girlsTry: true }).map((k) => [k.type, k]));
  const types = scoreEventTypes(sport);
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const undone = new Set(pairScoreUndos(sorted, types).values());
  const rows: FinishedScoreRow[] = [];
  let current = 0;
  for (const e of sorted) {
    const m = (e.metadata ?? {}) as { quarter?: unknown; intended_quarter?: unknown; made?: unknown };
    if (e.type === "quarter_start") {
      current = typeof m.quarter === "number" ? m.quarter : current + 1;
      continue;
    }
    const kind = kinds.get(e.type);
    if (!kind || undone.has(e.id)) continue;
    if (e.type === "conversion_attempt" && m.made !== true) continue;
    const period =
      typeof m.intended_quarter === "number"
        ? m.intended_quarter
        : typeof m.quarter === "number" && m.quarter > 0
          ? m.quarter
          : Math.max(1, current);
    rows.push({ id: e.id, type: e.type, kind, side: kind.side, playerId: kind.side === "us" ? e.player_id ?? null : null, period });
  }
  return rows;
}

export type ScoreFix =
  | { op: "add"; type: string; playerId: string | null; period: number }
  | { op: "delete"; eventId: string }
  | { op: "reassign"; eventId: string; playerId: string };

export interface ScoreFixRow {
  type: string;
  player_id: string | null;
  metadata: Record<string, unknown>;
}

const FIXED = { fixed_after_finish: true };

/** The events a fix writes, or why it can't. */
export function scoreFixRows(
  sport: Sport,
  events: GameEvent[],
  fix: ScoreFix,
  // A fix made after full time says so (FIXED); one from the live screen doesn't.
  { finished = true }: { finished?: boolean } = {},
): ScoreFixRow[] | { error: string } {
  const tag = finished ? FIXED : {};
  if (fix.op === "add") {
    const kind = scoreKinds(sport, { goalsFromPlay: true, girlsTry: true }).find((k) => k.type === fix.type);
    if (!kind) return { error: "That isn't a score in this sport." };
    if (!Number.isInteger(fix.period) || fix.period < 1 || fix.period > 4) return { error: "Pick the period it was scored in." };
    return [
      {
        type: kind.type,
        player_id: kind.side === "us" ? fix.playerId : null,
        metadata: { ...kind.metadata, quarter: fix.period, intended_quarter: fix.period, retro: true, ...tag },
      },
    ];
  }

  const target = finishedScoreLog(sport, events).find((r) => r.id === fix.eventId);
  if (!target) {
    const known = events.some((e) => e.id === fix.eventId && scoreEventTypes(sport).has(e.type));
    return { error: known ? "That score was taken off already." : "That score isn't in this game." };
  }
  const undo: ScoreFixRow = {
    type: "score_undo",
    player_id: target.playerId,
    metadata: { target_event_id: target.id, original_type: target.type, quarter: target.period, ...tag },
  };
  if (fix.op === "delete") return [undo];
  if (target.side !== "us") return { error: "Only our scores have a scorer." };
  return [
    undo,
    {
      type: target.type,
      player_id: fix.playerId,
      metadata: { ...target.kind.metadata, quarter: target.period, intended_quarter: target.period, retro: true, replaces: target.id, ...tag },
    },
  ];
}
