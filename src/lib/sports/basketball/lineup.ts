// ─── Basketball lineup ───────────────────────────────────────
// Soccer's shape without the keeper (.planning/BASKETBALL-PLAN.md, "What
// basketball owns"): a record of lines, the bench, and optional named
// slots. Equal minutes puts everyone on court in one `court` line; the
// line and position strategies use `guard` and `forward`, and the
// position strategies add `slots` (player → 1 to 5).

import type { AgeGroupConfig, ValidationIssue, ValidationResult } from "@/lib/sports/types";
import {
  BASKETBALL_LINES,
  BASKETBALL_TWO_LINES,
  type BasketballAgeGroupConfig,
  type BasketballLine,
  type BasketballPosition,
} from "@/lib/sports/basketball/types";

export interface BasketballLineup {
  /** Kids on court by line, in the order they're drawn. */
  lines: Record<BasketballLine, string[]>;
  bench: string[];
  /**
   * The position strategies: on-court player id → position. A sub takes
   * the position of the player they replace.
   */
  slots?: Record<string, BasketballPosition>;
}

export function emptyBasketballLineup(): BasketballLineup {
  return { lines: { guard: [], forward: [], court: [] }, bench: [] };
}

const POSITIONS: readonly BasketballPosition[] = ["pg", "sg", "sf", "pf", "c"];
const isPosition = (v: unknown): v is BasketballPosition =>
  typeof v === "string" && (POSITIONS as readonly string[]).includes(v);

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];

/**
 * A lineup read from event metadata or a draft, with every line present
 * (copied, so callers can change it). Missing lines are empty; slots
 * that aren't a position are dropped.
 */
export function normalizeBasketballLineup(raw: unknown): BasketballLineup {
  const l = (raw ?? {}) as Partial<{ lines: Partial<Record<BasketballLine, unknown>>; bench: unknown; slots: unknown }>;
  const lines = {} as Record<BasketballLine, string[]>;
  for (const line of BASKETBALL_LINES) lines[line] = ids(l.lines?.[line]);
  const out: BasketballLineup = { lines, bench: ids(l.bench) };
  if (l.slots && typeof l.slots === "object") {
    const slots: Record<string, BasketballPosition> = {};
    for (const [pid, pos] of Object.entries(l.slots as Record<string, unknown>)) if (isPosition(pos)) slots[pid] = pos;
    out.slots = slots;
  }
  return out;
}

/** Everyone on court, line by line (guards, forwards, then court). */
export function basketballOnCourt(lineup: BasketballLineup): string[] {
  return BASKETBALL_LINES.flatMap((line) => lineup.lines[line]);
}

/** A kid's line on court, or null when off it. */
export function basketballLineOf(lineup: BasketballLineup, playerId: string): BasketballLine | null {
  for (const line of BASKETBALL_LINES) if (lineup.lines[line].includes(playerId)) return line;
  return null;
}

/** A kid's position on court (the position strategies), or null. */
export function basketballPositionOf(lineup: BasketballLineup, playerId: string): BasketballPosition | null {
  return lineup.slots?.[playerId] ?? null;
}

/** Copy a lineup, so a caller can change it. */
export function cloneBasketballLineup(lu: BasketballLineup): BasketballLineup {
  return {
    lines: { guard: [...lu.lines.guard], forward: [...lu.lines.forward], court: [...lu.lines.court] },
    bench: [...lu.bench],
    ...(lu.slots ? { slots: { ...lu.slots } } : {}),
  };
}

/** A basketball age group's own rules; another sport's age group is an error. */
export function basketballRules(ag: AgeGroupConfig): BasketballAgeGroupConfig {
  if ("foulOutAt" in ag && "threePointers" in ag && "suggestedStrategy" in ag) return ag as BasketballAgeGroupConfig;
  throw new Error(`"${ag.id}" isn't a basketball age group`);
}

const LINE_WORD: Record<BasketballLine, string> = { guard: "the guards", forward: "the forwards", court: "the court" };
const POSITION_LINE: Record<BasketballPosition, BasketballLine> = { pg: "guard", sg: "guard", sf: "forward", pf: "forward", c: "forward" };

/**
 * Check a lineup against the game's size (`onFieldSize`, else the age
 * group's default):
 *   - kids either all in `court` (Equal minutes) or all in guards and
 *     forwards (the line and position strategies), never both;
 *   - no more on court than the game plays (fewer is a warning: a side
 *     can play short);
 *   - nobody in two places;
 *   - with positions, each position held once, by a kid on court in
 *     its line.
 */
export function validateBasketballLineup(
  lineup: unknown,
  ageGroup: AgeGroupConfig,
  onFieldSize?: number,
): ValidationResult {
  const l = lineup as Partial<BasketballLineup> | null;
  if (
    !l ||
    typeof l !== "object" ||
    !l.lines ||
    typeof l.lines !== "object" ||
    !Array.isArray(l.bench) ||
    BASKETBALL_LINES.some((line) => l.lines![line] !== undefined && !Array.isArray(l.lines![line]))
  ) {
    return { ok: false, issues: [{ kind: "error", message: "Invalid lineup shape." }] };
  }
  const ag = basketballRules(ageGroup);
  const lu = normalizeBasketballLineup(l);
  const size = onFieldSize ?? ag.defaultOnFieldSize;
  const issues: ValidationIssue[] = [];

  if (lu.lines.court.length > 0 && BASKETBALL_TWO_LINES.some((line) => lu.lines[line].length > 0)) {
    issues.push({ kind: "error", message: "Kids play either in guards and forwards or on the court, not both." });
  }

  const onCourt = basketballOnCourt(lu).length;
  if (onCourt > size) {
    issues.push({ kind: "error", message: `Too many players on court (${onCourt}); this game plays ${size}.` });
  } else if (onCourt < size) {
    issues.push({ kind: "warn", message: `${onCourt} on court for a ${size}-a-side game: playing short.` });
  }

  const seen = new Map<string, string>();
  const mark = (pid: string, where: string) => {
    const before = seen.get(pid);
    if (before) {
      issues.push({
        kind: "error",
        message: before === where ? `Player listed twice in ${where}.` : `Player is in both ${before} and ${where}.`,
        playerId: pid,
      });
    }
    seen.set(pid, where);
  };
  for (const line of BASKETBALL_LINES) for (const pid of lu.lines[line]) mark(pid, LINE_WORD[line]);
  for (const pid of lu.bench) mark(pid, "the bench");

  if (lu.slots) {
    const held = new Map<BasketballPosition, string>();
    for (const [pid, pos] of Object.entries(lu.slots)) {
      const line = basketballLineOf(lu, pid);
      if (!line) {
        issues.push({ kind: "error", message: "A position is held by a player who isn't on court.", playerId: pid, positionId: pos });
        continue;
      }
      if (line !== POSITION_LINE[pos]) {
        issues.push({ kind: "error", message: `${pos.toUpperCase()} plays in ${LINE_WORD[POSITION_LINE[pos]]}.`, playerId: pid, positionId: pos });
      }
      if (held.has(pos)) {
        issues.push({ kind: "error", message: `Two players hold ${pos.toUpperCase()}.`, playerId: pid, positionId: pos });
      }
      held.set(pos, pid);
    }
  }

  return { ok: !issues.some((i) => i.kind === "error"), issues };
}
