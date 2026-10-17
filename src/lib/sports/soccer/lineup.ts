// ─── Football (soccer) lineup ────────────────────────────────
// A keeper slot, a record of lines, the bench, and optional named
// slots (.planning/SOCCER-PLAN.md, "What soccer owns"). The keeper is a
// slot, not a line: drawn in the goal mouth, held for the half, and
// never taken off by a rolling sub. 4 a side has no keeper and one
// line, `field`.

import type { AgeGroupConfig, ValidationIssue, ValidationResult } from "@/lib/sports/types";
import {
  SOCCER_LINES,
  SOCCER_OUTFIELD_LINES,
  type SoccerAgeGroupConfig,
  type SoccerLine,
  type SoccerUnit,
} from "@/lib/sports/soccer/types";

export interface SoccerLineup {
  /** Who is in goal: null at 4 a side, or while the goal is empty. */
  keeper: string | null;
  /** Outfield kids by line, in the order they're drawn. */
  lines: Record<SoccerLine, string[]>;
  bench: string[];
  /**
   * Named positions (phase 3): on-field player id → position key. A sub
   * takes the slot of the player they replace.
   */
  slots?: Record<string, string>;
}

export function emptySoccerLineup(): SoccerLineup {
  return { keeper: null, lines: { def: [], mid: [], att: [], field: [] }, bench: [] };
}

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];

/**
 * A lineup read from event metadata or a draft, with every line present
 * (copied, so callers can change it). Missing lines are empty.
 */
export function normalizeSoccerLineup(raw: unknown): SoccerLineup {
  const l = (raw ?? {}) as Partial<{ keeper: unknown; lines: Partial<Record<SoccerLine, unknown>>; bench: unknown; slots: unknown }>;
  const lines = {} as Record<SoccerLine, string[]>;
  for (const line of SOCCER_LINES) lines[line] = ids(l.lines?.[line]);
  const out: SoccerLineup = {
    keeper: typeof l.keeper === "string" && l.keeper ? l.keeper : null,
    lines,
    bench: ids(l.bench),
  };
  if (l.slots && typeof l.slots === "object") out.slots = { ...(l.slots as Record<string, string>) };
  return out;
}

/** Outfield kids, line by line (defence, midfield, attack, then field). */
export function soccerOutfield(lineup: SoccerLineup): string[] {
  return SOCCER_LINES.flatMap((line) => lineup.lines[line]);
}

/** Everyone on the field: the keeper first, then the outfield. */
export function soccerOnField(lineup: SoccerLineup): string[] {
  return lineup.keeper ? [lineup.keeper, ...soccerOutfield(lineup)] : soccerOutfield(lineup);
}

/** Where a kid is on the field (`gk` or their line), or null when off it. */
export function soccerUnitOf(lineup: SoccerLineup, playerId: string): SoccerUnit | null {
  if (lineup.keeper === playerId) return "gk";
  for (const line of SOCCER_LINES) if (lineup.lines[line].includes(playerId)) return line;
  return null;
}

/** A soccer age group's own rules; another sport's age group is an error. */
function soccerRules(ag: AgeGroupConfig): SoccerAgeGroupConfig {
  if ("keeper" in ag && "formations" in ag && "subMode" in ag) return ag as SoccerAgeGroupConfig;
  throw new Error(`"${ag.id}" isn't a Football (soccer) age group`);
}

const LINE_WORD: Record<SoccerLine, string> = { def: "defence", mid: "midfield", att: "attack", field: "the field" };

/**
 * Check a lineup against the age group's rules and the game's size
 * (`onFieldSize`, else the age group's default):
 *   - a keeper from 7 a side, none at 4 a side;
 *   - kids in defence / midfield / attack with a keeper, all in `field`
 *     without one;
 *   - no more on the field than the game plays (fewer is a warning: a
 *     side can play short);
 *   - nobody in two places;
 *   - U12–U13: at least three lines (Football Victoria), a warning.
 */
export function validateSoccerLineup(
  lineup: unknown,
  ageGroup: AgeGroupConfig,
  onFieldSize?: number,
): ValidationResult {
  const l = lineup as Partial<SoccerLineup> | null;
  if (
    !l ||
    typeof l !== "object" ||
    !l.lines ||
    typeof l.lines !== "object" ||
    !Array.isArray(l.bench) ||
    !(l.keeper === null || l.keeper === undefined || typeof l.keeper === "string") ||
    SOCCER_LINES.some((line) => l.lines![line] !== undefined && !Array.isArray(l.lines![line]))
  ) {
    return { ok: false, issues: [{ kind: "error", message: "Invalid lineup shape." }] };
  }
  const ag = soccerRules(ageGroup);
  const lu = normalizeSoccerLineup(l);
  const size = onFieldSize ?? ag.defaultOnFieldSize;
  const withKeeper = ag.keeper !== "none";
  const issues: ValidationIssue[] = [];

  if (withKeeper && !lu.keeper) {
    issues.push({ kind: "error", message: "Nobody is in goal. Pick a keeper.", positionId: "gk" });
  }
  if (!withKeeper && lu.keeper) {
    issues.push({ kind: "error", message: `${ag.label} plays without a keeper.`, positionId: "gk", playerId: lu.keeper });
  }

  if (withKeeper && lu.lines.field.length > 0) {
    issues.push({ kind: "error", message: "With a keeper, kids play in defence, midfield or attack." });
  }
  if (!withKeeper && SOCCER_OUTFIELD_LINES.some((line) => lu.lines[line].length > 0)) {
    issues.push({ kind: "error", message: `${ag.label} plays without lines: everyone is in the field.` });
  }

  const onField = soccerOnField(lu).length;
  if (onField > size) {
    issues.push({ kind: "error", message: `Too many players on the field (${onField}); this game plays ${size}.` });
  } else if (onField < size) {
    issues.push({ kind: "warn", message: `${onField} on the field for a ${size}-a-side game: playing short.` });
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
  if (lu.keeper) mark(lu.keeper, "goal");
  for (const line of SOCCER_LINES) for (const pid of lu.lines[line]) mark(pid, LINE_WORD[line]);
  for (const pid of lu.bench) mark(pid, "the bench");

  if (withKeeper && (ag.id === "U12" || ag.id === "U13")) {
    const outfield = soccerOutfield(lu).length;
    const used = SOCCER_OUTFIELD_LINES.filter((line) => lu.lines[line].length > 0).length;
    if (outfield >= 3 && used < 3) {
      issues.push({ kind: "warn", message: "Football Victoria's U12–U13 rules ask for at least three lines." });
    }
  }

  return { ok: !issues.some((i) => i.kind === "error"), issues };
}
