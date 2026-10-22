// ─── Touch family lineup ─────────────────────────────────────
// Basketball's shape with lanes (.planning/FOUR-SPORTS-PLAN.md, "What the
// touch family owns"): a record of lanes and the bench. Minutes only puts
// everyone on the field in one `field` line; the position strategies use
// the three lanes, middle, link and wing, in the sizes the age group's
// shapes give. A mixed team's rule is checked here too.

import type { MixedGroup } from "@/lib/types";
import type { AgeGroupConfig, ValidationIssue, ValidationResult } from "@/lib/sports/types";
import {
  TOUCH_LANES,
  TOUCH_LINES,
  type MixedRule,
  type TouchAgeGroupConfig,
  type TouchLine,
} from "@/lib/sports/touch/types";
import { countMixedGroups } from "@/lib/sports/touch/mixed";

export interface TouchLineup {
  /** Kids on the field by lane, in the order they're drawn. */
  lines: Record<TouchLine, string[]>;
  bench: string[];
}

export function emptyTouchLineup(): TouchLineup {
  return { lines: { middle: [], link: [], wing: [], field: [] }, bench: [] };
}

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];

/**
 * A lineup read from event metadata or a draft, with every lane present
 * (copied, so callers can change it). Missing lanes are empty.
 */
export function normalizeTouchLineup(raw: unknown): TouchLineup {
  const l = (raw ?? {}) as Partial<{ lines: Partial<Record<TouchLine, unknown>>; bench: unknown }>;
  const lines = {} as Record<TouchLine, string[]>;
  for (const line of TOUCH_LINES) lines[line] = ids(l.lines?.[line]);
  return { lines, bench: ids(l.bench) };
}

/** Everyone on the field, lane by lane (middles, links, wings, then field). */
export function touchOnField(lineup: TouchLineup): string[] {
  return TOUCH_LINES.flatMap((line) => lineup.lines[line]);
}

/** A kid's lane on the field, or null when off it. */
export function touchLineOf(lineup: TouchLineup, playerId: string): TouchLine | null {
  for (const line of TOUCH_LINES) if (lineup.lines[line].includes(playerId)) return line;
  return null;
}

/** Copy a lineup, so a caller can change it. */
export function cloneTouchLineup(lu: TouchLineup): TouchLineup {
  return {
    lines: { middle: [...lu.lines.middle], link: [...lu.lines.link], wing: [...lu.lines.wing], field: [...lu.lines.field] },
    bench: [...lu.bench],
  };
}

/** Whether a lineup plays in lanes (the position strategies), not one field. */
export function touchUsesLanes(lineup: TouchLineup): boolean {
  return lineup.lines.field.length === 0 && TOUCH_LANES.some((l) => lineup.lines[l].length > 0);
}

/** A touch-family age group's own rules; another sport's age group is an error. */
export function touchRules(ag: AgeGroupConfig): TouchAgeGroupConfig {
  if ("shapes" in ag && "mixedPreset" in ag && "girlsTryDouble" in ag) return ag as TouchAgeGroupConfig;
  throw new Error(`"${ag.id}" isn't a touch or Oztag age group`);
}

/** Each lane's name, as sentences use it. */
export const TOUCH_LINE_WORD: Record<TouchLine, string> = {
  middle: "the middles",
  link: "the links",
  wing: "the wings",
  field: "the field",
};

const shapeWords = (lines: Record<TouchLine, number>) =>
  `${lines.middle} ${lines.middle === 1 ? "middle" : "middles"}, ${lines.link} ${lines.link === 1 ? "link" : "links"} and ${lines.wing} ${lines.wing === 1 ? "wing" : "wings"}`;

/** A mixed team's rule and each kid's group, for the validator. */
export interface TouchMixedCheck {
  rule: MixedRule;
  groupOf: (playerId: string) => MixedGroup | null | undefined;
}

/**
 * Check a lineup against the game's size (`onFieldSize`, else the age
 * group's default):
 *   - kids either all in `field` (Minutes only) or all in lanes, never
 *     both, and lanes in a shape the age group plays at that count;
 *   - no more on the field than the game plays (fewer is a warning: a
 *     side can play short);
 *   - nobody in two places;
 *   - on a mixed team (`mixed`): every kid on the field has a group, no
 *     more boys than the cap, and at least the rule's girls and boys.
 */
export function validateTouchLineup(
  lineup: unknown,
  ageGroup: AgeGroupConfig,
  onFieldSize?: number,
  mixed?: TouchMixedCheck | null,
): ValidationResult {
  const l = lineup as Partial<TouchLineup> | null;
  if (
    !l ||
    typeof l !== "object" ||
    !l.lines ||
    typeof l.lines !== "object" ||
    !Array.isArray(l.bench) ||
    TOUCH_LINES.some((line) => l.lines![line] !== undefined && !Array.isArray(l.lines![line]))
  ) {
    return { ok: false, issues: [{ kind: "error", message: "Invalid lineup shape." }] };
  }
  const ag = touchRules(ageGroup);
  const lu = normalizeTouchLineup(l);
  const size = onFieldSize ?? ag.defaultOnFieldSize;
  const issues: ValidationIssue[] = [];
  const on = touchOnField(lu);

  const inLanes = TOUCH_LANES.some((line) => lu.lines[line].length > 0);
  if (lu.lines.field.length > 0 && inLanes) {
    issues.push({ kind: "error", message: "Kids play either in lanes or on the field, not both." });
  } else if (inLanes) {
    const shapes = ag.shapes[on.length] ?? [];
    const fits = shapes.some((s) => TOUCH_LANES.every((line) => s.lines[line] === lu.lines[line].length));
    if (shapes.length > 0 && !fits) {
      issues.push({
        kind: "error",
        message: `${on.length} a side plays ${shapes.map((s) => shapeWords(s.lines)).join(", or ")}.`,
      });
    }
  }

  if (on.length > size) {
    issues.push({ kind: "error", message: `Too many players on the field (${on.length}); this game plays ${size}.` });
  } else if (on.length < size) {
    issues.push({ kind: "warn", message: `${on.length} on the field for a ${size}-a-side game: playing short.` });
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
  for (const line of TOUCH_LINES) for (const pid of lu.lines[line]) mark(pid, TOUCH_LINE_WORD[line]);
  for (const pid of lu.bench) mark(pid, "the bench");

  if (mixed) {
    const { rule, groupOf } = mixed;
    for (const pid of on) {
      if (!groupOf(pid)) {
        issues.push({ kind: "error", message: "Mark Girl or Boy for every player on a mixed team.", playerId: pid });
      }
    }
    const count = countMixedGroups(on, groupOf);
    if (count.boys > rule.maxBoys) {
      issues.push({
        kind: "error",
        message: `Too many boys on the field (${count.boys}); the mixed rule allows ${rule.maxBoys}.`,
      });
    }
    if (count.girls < rule.minGirls) {
      issues.push({
        kind: "error",
        message: `The mixed rule needs at least ${rule.minGirls} ${rule.minGirls === 1 ? "girl" : "girls"} on the field.`,
      });
    }
    if (count.boys < rule.minBoys) {
      issues.push({
        kind: "error",
        message: `The mixed rule needs at least ${rule.minBoys} ${rule.minBoys === 1 ? "boy" : "boys"} on the field.`,
      });
    }
  }

  return { ok: !issues.some((i) => i.kind === "error"), issues };
}
