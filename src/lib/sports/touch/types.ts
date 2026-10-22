// ─── Touch family — its own types ────────────────────────────
// Touch football and Oztag share a family (.planning/FOUR-SPORTS-PLAN.md),
// as rugby league and union share rugby's: no keeper, unlimited rolling
// subs through an interchange box, and positions that are lanes across
// the field (middles in the centre, links either side, wings on the
// edges) rather than lines back to front. Positions are optional, as in
// basketball. A mixed team caps the boys on the field. Each sport
// states its own rules in its own config (./index.ts for touch,
// ../oztag/index.ts for Oztag).

import type { AgeGroupConfig } from "@/lib/sports/types";

/**
 * Where a kid on the field plays. Minutes only has no positions, so
 * everyone is in `field`; the position strategies put kids in a lane.
 * These are the family's `sport_lines` rows (migration 0071).
 */
export type TouchLine = "middle" | "link" | "wing" | "field";

export const TOUCH_LINES: readonly TouchLine[] = ["middle", "link", "wing", "field"];

/** The three lanes, centre out. */
export const TOUCH_LANES: readonly TouchLine[] = ["middle", "link", "wing"];

/** Kids in each lane at one on-field size ("2-2-2": middles, links, wings). */
export interface TouchShape {
  id: string;
  lines: Record<TouchLine, number>;
}

/**
 * How kids rotate (How we play):
 *   minutes           — Minutes only: no positions
 *   rotate-positions  — Rotate positions: every kid takes turns at
 *                       middle, link and wing over the season (TFA's
 *                       junior framework, from age 10)
 *   home-position     — Home position: a kid's lane, time in the others
 *                       too
 */
export type TouchStrategy = "minutes" | "rotate-positions" | "home-position";

export const TOUCH_STRATEGIES: readonly TouchStrategy[] = ["minutes", "rotate-positions", "home-position"];

/**
 * A mixed team's on-field rule: at most `maxBoys` boys, at least
 * `minGirls` girls and `minBoys` boys. Touch (TFA rule 5.4) is 3 / 1 / 1;
 * Oztag (ITF rule 3.3) is 4 / 1 / 0. A coach can set a local rule.
 */
export interface MixedRule {
  maxBoys: number;
  minGirls: number;
  minBoys: number;
}

/**
 * A touch-family age group states every rule itself (sports are
 * independent).
 */
export interface TouchAgeGroupConfig extends AgeGroupConfig {
  /** Lane shapes for each on-field size from min to max, the default first. */
  shapes: Record<number, TouchShape[]>;
  /** How we play's suggested rotation (★). */
  suggestedStrategy: TouchStrategy;
  /** The sport's mixed rule, the preset when a coach marks a team mixed. */
  mixedPreset: MixedRule;
  /**
   * A girl's try counts 2 in a mixed game (Oztag, ITF rule 4.3): the
   * default for a mixed team, which the team can turn off. False = the
   * sport has no girl's try.
   */
  girlsTryDouble: boolean;
}
